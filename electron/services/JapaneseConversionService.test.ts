import { describe, it, expect, vi } from 'vitest';
import { JapaneseConversionService } from './JapaneseConversionService.js';
import { ImeEngineError } from './ime/ConversionEngine.js';

const target = (revision = 1, sessionId = 'keyboard') => ({ sessionId, revision });
const result = (request: any, texts = ['日本語', '日本語', '']) => ({
  sessionId: request.sessionId, revision: request.revision, engine: 'zenzai' as 'zenzai' | 'azookey' | 'kana',
  elapsedMs: 12, candidates: texts.map(text => ({ text })),
});
function setup() {
  const engine = {
    status: { state: 'ready', engine: 'zenzai' },
    convert: vi.fn(async (request: any) => result(request)),
    reset: vi.fn(async (_sessionId: string) => {}),
    dispose: vi.fn(async () => {}),
  };
  return { engine, service: new JapaneseConversionService(engine) };
}
function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (error: any) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('asynchronous Japanese conversion facade', () => {
  it('converts the full reading and same-field left context without provider segmentation', async () => {
    const { engine, service } = setup();
    const state = await service.convert('ニホンゴ', { ...target(), previousText: '私は', previousWord: 'ignored' });
    expect(engine.convert).toHaveBeenCalledWith({ ...target(), text: 'にほんご', leftContext: '私は' });
    expect(state.candidates).toEqual([{ text: '日本語' }, { text: 'にほんご' }]);
    expect(state.segments).toEqual([{ raw: 'にほんご', candidates: state.candidates, selectedIndex: 0 }]);
    expect(state).toMatchObject({ ...target(), selectedCandidate: '日本語', preedit: '日本語', engine: 'zenzai', elapsedMs: 12 });
  });

  it('returns detached snapshots and cycles/commits full candidates without learning', async () => {
    const { engine, service } = setup();
    const state = await service.convert('にほんご', target());
    state.candidates[0].text = 'changed';
    expect((await service.nextCandidate(target())).preedit).toBe('にほんご');
    expect((await service.nextCandidate(target())).preedit).toBe('日本語');
    expect(await service.commit(1, target())).toMatchObject({ committed: 'にほんご', state: { isConverting: false, rawKana: '' } });
    expect(engine.reset).toHaveBeenCalledWith('keyboard');
    await expect(service.commit(0, target())).rejects.toMatchObject({ code: 'no-candidates' });
  });

  it('rejects invalid candidate indexes without changing the snapshot', async () => {
    const { service } = setup();
    await service.convert('にほんご', target());
    await expect(service.commit(9, target())).rejects.toMatchObject({ code: 'invalid-candidate' });
    expect(service.buildState().preedit).toBe('日本語');
  });

  it('rejects a renderer commit snapshot that differs from the selected candidate', async () => {
    const { engine, service } = setup();
    await service.convert('にほんご', target());
    await expect(service.commit(0, { ...target(), expectedText: 'different' })).rejects.toMatchObject({ code: 'stale-candidate' });
    expect(engine.reset).not.toHaveBeenCalled();
    expect(service.buildState().preedit).toBe('日本語');
  });

  it('does not apply an older result that arrives last', async () => {
    const { engine, service } = setup();
    const old = deferred();
    engine.convert.mockImplementationOnce(() => old.promise);
    const first = service.convert('にほん', target());
    const rejected = expect(first).rejects.toMatchObject({ code: 'superseded' });
    await service.convert('にほんご', target(2));
    old.resolve(result(target(), ['日本']));
    await rejected;
    expect(service.buildState()).toMatchObject({ revision: 2, rawKana: 'にほんご', preedit: '日本語' });
  });

  it('invalidates next and commit while a newer conversion is still pending', async () => {
    const { engine, service } = setup();
    await service.convert('にほんご', target());
    const wait = deferred();
    engine.convert.mockImplementationOnce(() => wait.promise);
    const pending = service.convert('きょう', target(2));
    await expect(service.nextCandidate(target())).rejects.toMatchObject({ code: 'stale-revision' });
    await expect(service.commit(0, target())).rejects.toMatchObject({ code: 'stale-revision' });
    await expect(service.commit(0, target(2))).rejects.toMatchObject({ code: 'no-candidates' });
    wait.resolve(result(target(2), ['今日']));
    await pending;
  });

  it('invalidates synchronously on cancel, before the reset acknowledgement', async () => {
    const { engine, service } = setup();
    const inference = deferred(), reset = deferred();
    engine.convert.mockImplementationOnce(() => inference.promise);
    engine.reset.mockImplementationOnce(() => reset.promise);
    const pending = service.convert('にほんご', target());
    const rejected = expect(pending).rejects.toMatchObject({ code: 'superseded' });
    const cancelling = service.cancel(target(2));
    inference.resolve(result(target()));
    await rejected;
    expect(service.buildState()).toMatchObject({ revision: 2, isConverting: false });
    await service.convert('きょう', target(3));
    reset.resolve(undefined);
    expect(await cancelling).toMatchObject({ revision: 2, isConverting: false });
    expect(service.buildState().revision).toBe(3);
  });

  it('returns the captured commit state if reset overlaps a new conversion', async () => {
    const { engine, service } = setup();
    await service.convert('にほんご', target());
    const reset = deferred();
    engine.reset.mockImplementationOnce(() => reset.promise);
    const committing = service.commit(0, target());
    await service.convert('きょう', target(2));
    reset.resolve(undefined);
    expect(await committing).toMatchObject({ committed: '日本語', state: { revision: 1, isConverting: false } });
    expect(service.buildState().revision).toBe(2);
  });

  it('rejects old, duplicate and foreign session operations', async () => {
    const { service } = setup();
    await service.convert('にほんご', target(3));
    for (const stale of [target(2), target(3), target(4, 'other')]) {
      await expect(service.convert('かな', stale)).rejects.toMatchObject({ code: 'stale-revision' });
    }
    await expect(service.nextCandidate(target(2))).rejects.toMatchObject({ code: 'stale-revision' });
    await expect(service.cancel(target(2))).rejects.toMatchObject({ code: 'stale-revision' });
  });

  it('releases a closed renderer and ignores its late result even if revision is reused', async () => {
    const { engine, service } = setup();
    const old = deferred();
    engine.convert.mockImplementationOnce(() => old.promise);
    const pending = service.convert('にほん', target());
    const rejected = expect(pending).rejects.toMatchObject({ code: 'superseded' });
    await service.releaseSession();
    await service.convert('にほんご', target(1, 'new-renderer'));
    old.resolve(result(target()));
    await rejected;
    expect(service.buildState().sessionId).toBe('new-renderer');
  });

  it.each(['exit', 'request-timeout', 'unavailable'])('preserves kana on helper %s and recovers next time', async (code) => {
    const { engine, service } = setup();
    engine.convert.mockRejectedValueOnce(new ImeEngineError(code));
    expect(await service.convert('にほんご', target())).toMatchObject({ engine: 'kana', preedit: 'にほんご' });
    expect(service.status).toMatchObject({ engine: 'kana', reason: code });
    expect(await service.convert('にほんご', target(2))).toMatchObject({ engine: 'zenzai' });
    expect(service.status.engine).toBe('zenzai');
  });

  it.each(['superseded', 'cancelled', 'disposed', 'invalid-request'])('does not turn %s into a successful fallback', async (code) => {
    const { engine, service } = setup();
    engine.convert.mockRejectedValueOnce(new ImeEngineError(code));
    await expect(service.convert('かな', target())).rejects.toMatchObject({ code });
    expect(service.buildState().isConverting).toBe(false);
  });

  it('preserves helper AzooKey fallback classification', async () => {
    const { engine, service } = setup();
    engine.convert.mockImplementationOnce(async request => ({ ...result(request), engine: 'azookey' }));
    expect(await service.convert('かな', target())).toMatchObject({ engine: 'azookey' });
  });

  it('validates requests before invoking the engine', async () => {
    const { engine, service } = setup();
    await expect(service.convert('かな', {})).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(service.convert('かな', { ...target(), previousText: 'x'.repeat(4097) })).rejects.toMatchObject({ code: 'invalid-request' });
    expect(engine.convert).not.toHaveBeenCalled();
  });

  it('rejects a mismatched engine result', async () => {
    const { engine, service } = setup();
    engine.convert.mockImplementationOnce(async request => result({ ...request, revision: 99 }));
    await expect(service.convert('かな', target())).rejects.toMatchObject({ code: 'invalid-result' });
    expect(service.buildState().candidates).toEqual([]);
  });

  it('empty input resets without inference', async () => {
    const { engine, service } = setup();
    expect(await service.convert('', target())).toMatchObject({ rawKana: '', isConverting: false });
    expect(engine.convert).not.toHaveBeenCalled();
    expect(engine.reset).toHaveBeenCalledWith('keyboard');
  });

  it('disposes once and invalidates late inference', async () => {
    const { engine, service } = setup();
    const wait = deferred();
    engine.convert.mockImplementationOnce(() => wait.promise);
    const pending = service.convert('かな', target());
    const rejected = expect(pending).rejects.toMatchObject({ code: 'superseded' });
    await service.dispose();
    wait.resolve(result(target()));
    await rejected;
    await service.dispose();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    await expect(service.convert('かな', target(2))).rejects.toMatchObject({ code: 'disposed' });
  });
});
