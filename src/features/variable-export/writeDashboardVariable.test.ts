// locationService stub — the only @grafana/runtime surface this module touches.
// Dereferenced lazily inside the service getters, so hoisting order is safe.
const partialMock = jest.fn();
const getSearchMock = jest.fn(() => new URLSearchParams());
jest.mock('@grafana/runtime', () => ({
  locationService: {
    getSearch: (): URLSearchParams => getSearchMock(),
    partial: (query: Record<string, unknown>, replace?: boolean): void => {
      partialMock(query, replace);
    },
  },
}));

import { EMPTY_VALUE_SENTINEL, writeDashboardVariable } from './writeDashboardVariable';

describe('writeDashboardVariable', () => {
  beforeEach(() => {
    partialMock.mockClear();
    getSearchMock.mockReset();
    getSearchMock.mockReturnValue(new URLSearchParams());
  });

  it('writes the values as a multi-value var- param with history replace', () => {
    writeDashboardVariable('pod_list', ['mongo-0', 'mongo-1']);
    expect(partialMock).toHaveBeenCalledTimes(1);
    expect(partialMock).toHaveBeenCalledWith({ 'var-pod_list': ['mongo-0', 'mongo-1'] }, true);
  });

  it('skips the write when the URL already holds the same values in any order', () => {
    getSearchMock.mockReturnValue(new URLSearchParams('var-pod_list=mongo-1&var-pod_list=mongo-0'));
    writeDashboardVariable('pod_list', ['mongo-0', 'mongo-1']);
    expect(partialMock).not.toHaveBeenCalled();
  });

  it('writes the $__empty sentinel instead of deleting the key when the list is empty', () => {
    getSearchMock.mockReturnValue(new URLSearchParams('var-pod_list=mongo-0'));
    writeDashboardVariable('pod_list', []);
    expect(partialMock).toHaveBeenCalledWith({ 'var-pod_list': [EMPTY_VALUE_SENTINEL] }, true);
  });

  it('skips the write when the list is empty and the sentinel is already set', () => {
    getSearchMock.mockReturnValue(new URLSearchParams(`var-pod_list=${EMPTY_VALUE_SENTINEL}`));
    writeDashboardVariable('pod_list', []);
    expect(partialMock).not.toHaveBeenCalled();
  });

  it('writes when the URL holds different values', () => {
    getSearchMock.mockReturnValue(new URLSearchParams('var-pod_list=mongo-0'));
    writeDashboardVariable('pod_list', ['mongo-0', 'nats-0']);
    expect(partialMock).toHaveBeenCalledWith({ 'var-pod_list': ['mongo-0', 'nats-0'] }, true);
  });
});
