import {Store, StoreEnhancer} from 'redux';
import {
  StoreTester,
  createActionLogger,
  dispatchAction,
  waitForAction,
  waitForMs,
  waitForPromise,
  ActionListener,
  waitForState,
  waitForCall,
  waitFor,
  waitForInitializeFunction,
  waitForSyncWorkToFinish,
} from '../';
import {configureStore, createSlice} from '@reduxjs/toolkit';
import {createCaller} from '../createCaller';
import {runAsyncEffect} from '../runAsyncEffect';

describe('store with simple reducer', function () {
  const initialState = {
    status: 'C',
    number: 0,
  };
  type InitialState = typeof initialState;
  const {actions: sliceActions, reducer} = createSlice({
    name: 'default',
    initialState,
    reducers: {
      setOkStatus: state => {
        state.status = 'Ok';
      },
      setErrorStatus: state => {
        state.status = 'Error';
      },
      incrementValue: state => {
        state.number++;
      },
    },
  });

  function initStore(listener: ActionListener<InitialState>) {
    const enhancers: StoreEnhancer[] = [createActionLogger(listener)];

    return configureStore({
      reducer,
      enhancers,
      preloadedState: undefined,
    });
  }

  const params = {initStore, errorTimoutMs: 10, throwOnTimeout: false};

  it('should catch 1 action and produce correct state', async () => {
    const s = new StoreTester(params);
    const {actions, state, error} = await s.run(function* () {
      const {
        state: {status},
        actions,
      } = yield dispatchAction(sliceActions.setOkStatus());
      expect(status).toBe('Ok');
      expect(actions.length).toBe(1);
    });

    expect(actions.length).toBe(1);
    expect(actions[0]).toEqual(sliceActions.setOkStatus());
    expect(state.status).toBe('Ok');
    expect(error).toBeUndefined();
  });

  it('should catch 2 actions and increment number up to 2', async () => {
    const s = new StoreTester(params);
    const {actions, state, error} = await s.run(function* () {
      const result1 = yield dispatchAction(sliceActions.incrementValue());

      expect(result1.state.number).toBe(1);
      expect(result1.actions.length).toBe(1);

      const result2 = yield dispatchAction(sliceActions.incrementValue());

      expect(result2.state.number).toBe(2);
      expect(result2.actions.length).toBe(2);
    });

    expect(actions.length).toBe(2);
    expect(actions).toEqual([sliceActions.incrementValue(), sliceActions.incrementValue()]);
    expect(state.status).toBe('C');
    expect(error).toBeUndefined();
  });

  it('should fail with timeout when waiting for dispatched action', async () => {
    const s = new StoreTester(params);
    let wasRestCodeRun = false;
    const {actions, state, error} = await s.run(function* () {
      yield dispatchAction(sliceActions.setOkStatus());
      yield waitForAction(sliceActions.setOkStatus.type);
      wasRestCodeRun = true;
    });

    expect(wasRestCodeRun).toBeFalsy();
    expect(actions.length).toBe(1);
    expect(state.status).toBe('Ok');
    expect(error).not.toBeUndefined();
    expect(error).toMatchSnapshot();
  });

  it('should fail with timeout when waiting for dispatched action after waiting several ms', async () => {
    const s = new StoreTester(params);
    let wasRestCodeRun = false;
    const {actions, state, error} = await s.run(function* () {
      yield waitForMs(10);
      yield dispatchAction(sliceActions.setOkStatus());
      yield waitForAction(sliceActions.setOkStatus.type);
      wasRestCodeRun = true;
    });

    expect(wasRestCodeRun).toBeFalsy();
    expect(actions.length).toBe(1);
    expect(state.status).toBe('Ok');
    expect(error).not.toBeUndefined();
    expect(error).toMatchSnapshot();
  });

  it('should fail with timeout when waiting for dispatched action after waiting promise', async () => {
    const s = new StoreTester(params);
    let wasRestCodeRun = false;

    const {actions, state, error} = await s.run(function* () {
      yield waitForPromise(
        new Promise<void>(res => {
          setTimeout(() => res(), 10);
        })
      );
      yield dispatchAction(sliceActions.setOkStatus());
      yield waitForAction(sliceActions.setOkStatus.type);
      wasRestCodeRun = true;
    });

    expect(wasRestCodeRun).toBeFalsy();
    expect(actions.length).toBe(1);
    expect(state.status).toBe('Ok');
    expect(error).not.toBeUndefined();
    expect(error).toMatchSnapshot();
  });

  it('should not catch action dispatched by store tester', async () => {
    const s = new StoreTester(params);
    const {error} = await s.run(function* () {
      yield dispatchAction(sliceActions.setOkStatus());
      yield waitForAction(sliceActions.setOkStatus.type);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should wait for state change right after dispatch which leads to this state', async () => {
    const s = new StoreTester(params);
    const {error, state} = await s.run(function* () {
      yield dispatchAction(sliceActions.setOkStatus());
      yield waitForState(state => state.status === 'Ok');
    });

    expect(error).toBeUndefined();
    expect(state.status).toBe('Ok');
  });

  it('should wait for state change right even if no actions are dispatched', async () => {
    const s = new StoreTester(params);
    const {error, state} = await s.run(function* () {
      yield waitForState(() => true);
    });

    expect(error).toBeUndefined();
    expect(state).toBe(state);
  });

  it('should wait for state change and called caller even if no actions are dispatched', async () => {
    const s = new StoreTester(params);
    const caller = createCaller();
    caller();
    const {error, state} = await s.run(function* () {
      yield waitForState(() => true);
      yield waitForCall(caller);
    });

    expect(error).toBeUndefined();
    expect(state).toBe(state);
  });

  it('should wait for called caller and state change even if no actions are dispatched', async () => {
    const s = new StoreTester(params);
    const caller = createCaller();
    caller();
    const {error, state} = await s.run(function* () {
      yield waitForCall(caller);
      yield waitForState(() => true);
    });

    expect(error).toBeUndefined();
    expect(state).toBe(state);
  });

  it('should wait for state change right after waiting for already called caller', async () => {
    const caller = createCaller();
    caller();
    const s = new StoreTester(params);
    const {error, state} = await s.run(function* () {
      yield dispatchAction(sliceActions.setOkStatus());
      yield waitForCall(caller);
      yield waitForState(state => state.status === 'Ok');
    });

    expect(error).toBeUndefined();
    expect(state.status).toBe('Ok');
  });

  it('should wait twice for the same state change right after dispatch which leads to this state', async () => {
    const s = new StoreTester(params);
    const {error, state} = await s.run(function* () {
      yield dispatchAction(sliceActions.setOkStatus());
      yield waitForState(state => state.status === 'Ok');
      yield waitForState(state => state.status === 'Ok');
    });

    expect(error).toBeUndefined();
    expect(state.status).toBe('Ok');
  });

  it('should fail with error when waiting for unknown action', async () => {
    const s = new StoreTester(params);
    const {error} = await s.run(function* () {
      yield waitForAction('unknown');
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should fail with error when waiting for caller which will not be called', async () => {
    const s = new StoreTester(params);
    const {error} = await s.run(function* () {
      yield waitForCall(createCaller());
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should fail with error when waiting unreachable state', async () => {
    const s = new StoreTester(params);
    const {error} = await s.run(function* () {
      yield waitForState(() => false);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should fail with error when waiting unresolvable promise', async () => {
    const s = new StoreTester(params);
    const {error} = await s.run(function* () {
      yield waitForPromise(
        new Promise<void>(() => {
          return;
        })
      );
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should fail with error when waiting longer than error timeout', async () => {
    const s = new StoreTester(params);
    const {error} = await s.run(function* () {
      yield waitForMs(10000);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should fail with error when waiting for unreachable condition', async () => {
    const s = new StoreTester(params);
    const {error} = await s.run(function* () {
      yield waitFor(() => false);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should call initializeFunction before the result of it', async () => {
    let placeToCall = 'unknown';
    const realParams = {
      ...params,
      initializeFunction: () => {
        placeToCall = 'init';
        return () => void 0;
      },
    };
    await new StoreTester(realParams).run(function* () {
      expect(placeToCall).toBe('unknown');
      yield waitForMs(1);
      expect(placeToCall).toBe('init');
      yield waitFor(() => true);
    });
  });

  it('should call the result of initializeFunction after store tester body', async () => {
    let wasCalled = false;
    const realParams = {
      ...params,
      initializeFunction: () => {
        return () => {
          wasCalled = true;
        };
      },
    };
    await new StoreTester(realParams).run(function* () {
      expect(wasCalled).toBeFalsy();
      yield waitFor(() => true);
    });
    expect(wasCalled).toBeTruthy();
  });

  it('should catch action dispatched in initializeFunction', async () => {
    const realParams = {
      ...params,
      initializeFunction: (store: Store<InitialState>) => {
        store.dispatch(sliceActions.setOkStatus());
        return () => void 0;
      },
    };
    const {error, actions, state} = await new StoreTester(realParams).run(function* () {
      yield waitForAction(sliceActions.setOkStatus.type);
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus()]);
    expect(state.status).toBe('Ok');
  });

  it('should not catch action and update state when action is dispatched in the result of initializeFunction', async () => {
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        return () => {
          store.dispatch(sliceActions.setOkStatus());
        };
      },
    };
    const {error, actions, state} = await new StoreTester(realParams).run(function* () {
      yield waitForAction(sliceActions.setOkStatus.type);
    });

    expect(error).toBeDefined();
    expect(actions).toEqual([]);
    expect(state.status).toBe('C');
    expect(error).toMatchSnapshot();
  });

  it('should wait for caller when it is called in initializeFunction', async () => {
    const caller = createCaller();
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: () => {
        caller();
        return () => void 0;
      },
    };
    const {error} = await new StoreTester(realParams).run(function* () {
      yield waitForCall(caller);
    });

    expect(error).toBeUndefined();
    expect(caller.wasCalled()).toBeTruthy();
  });

  it('should not wait for caller when it is called in the result of initializeFunction', async () => {
    const caller = createCaller();
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: () => {
        return () => {
          caller();
        };
      },
    };
    const {error} = await new StoreTester(realParams).run(function* () {
      yield waitForCall(caller);
    });

    expect(error).toBeDefined();
    expect(caller.wasCalled()).toBeTruthy();
    expect(error).toMatchSnapshot();
  });

  it('should wait for caller when it is called in initializeFunction and when waitForInitializeFunction is used', async () => {
    const caller = createCaller();
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: () => {
        caller();
        return () => void 0;
      },
    };
    const {error} = await new StoreTester(realParams).run(function* () {
      yield waitForInitializeFunction();
      yield waitForCall(caller);
    });

    expect(error).toBeUndefined();
    expect(caller.wasCalled()).toBeTruthy();
  });

  it('should wait for caller when it is called in initializeFunction and when there are 2 waitForInitializeFunction used before waitForCall', async () => {
    const caller = createCaller();
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: () => {
        caller();
        return () => void 0;
      },
    };
    const {error} = await new StoreTester(realParams).run(function* () {
      yield waitForInitializeFunction();
      yield waitForInitializeFunction();
      yield waitForCall(caller);
    });

    expect(error).toBeUndefined();
    expect(caller.wasCalled()).toBeTruthy();
  });

  it('should catch action in subscribe if waitForInitializeFunction is used', async () => {
    let wasSubscribeCalled = false;
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        store.subscribe(() => {
          wasSubscribeCalled = true;
        });
        return () => void 0;
      },
    };
    const {error, actions} = await new StoreTester(realParams).run(function* () {
      yield waitForInitializeFunction();
      yield dispatchAction(sliceActions.setOkStatus());
    });

    expect(wasSubscribeCalled).toBeTruthy();
    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus()]);
  });

  it('should catch action in subscribe if waitForInitializeFunction is used twice', async () => {
    let wasSubscribeCalled = false;
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        store.subscribe(() => {
          wasSubscribeCalled = true;
        });
        return () => void 0;
      },
    };
    const {error, actions} = await new StoreTester(realParams).run(function* () {
      yield waitForInitializeFunction();
      yield waitForInitializeFunction();
      yield dispatchAction(sliceActions.setOkStatus());
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus()]);
    expect(wasSubscribeCalled).toBeTruthy();
  });

  it('should call subscribe listener if action dispatched without waitForInitializeFunction', async () => {
    let wasSubscribeCalled = false;
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        store.subscribe(() => {
          wasSubscribeCalled = true;
        });
        return () => void 0;
      },
    };
    const {error, actions} = await new StoreTester(realParams).run(function* () {
      yield dispatchAction(sliceActions.setOkStatus());
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus()]);
    expect(wasSubscribeCalled).toBeTruthy();
  });

  it('should not log dispatched in unmount function action when waitForSyncWorkToFinish is used at the end', async () => {
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        return () => {
          store.dispatch(sliceActions.setOkStatus());
        };
      },
    };
    const {actions, error} = await new StoreTester(realParams).run(function* () {
      yield dispatchAction(sliceActions.setErrorStatus());
      yield waitForSyncWorkToFinish();
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setErrorStatus()]);
  });

  it('should not wait for action dispatched in initializeFunction if waitForInitializeFunction is used first', async () => {
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        store.dispatch(sliceActions.setOkStatus());
        return () => void 0;
      },
    };
    const {actions, error} = await new StoreTester(realParams).run(function* () {
      yield waitForInitializeFunction();
      yield waitForAction(sliceActions.setOkStatus.type);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
    expect(actions).toEqual([sliceActions.setOkStatus()]);
  });

  it('should log action when it is dispatched in resolved promise in initializeFunction when waitForSyncWorkToFinish is present at the end', async () => {
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        Promise.resolve().then(() => store.dispatch(sliceActions.setOkStatus()));
        return () => void 0;
      },
    };
    const {actions, error} = await new StoreTester(realParams).run(function* () {
      yield waitForSyncWorkToFinish();
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus()]);
  });

  it('should run timer yielded in test body', async () => {
    jest.useFakeTimers();

    const realParams = {
      ...params,
      errorTimoutMs: 10,
    };
    const {actions, error} = await new StoreTester(realParams).run(function* () {
      runAsyncEffect(() => {
        jest.advanceTimersByTime(30000);
      });
      yield waitForMs(30000);
      yield dispatchAction(sliceActions.setOkStatus());
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus()]);

    jest.useRealTimers();
  });

  it('should run only first timer yielded in test body', async () => {
    jest.useFakeTimers();

    const realParams = {
      ...params,
      errorTimoutMs: 10,
    };
    const {error} = await new StoreTester(realParams).run(function* () {
      runAsyncEffect(() => {
        jest.runAllTimers();
      });
      yield waitForMs(30000);
      yield waitForMs(30000);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();

    jest.useRealTimers();
  });

  it('should wait for action dispatched in runAsyncEffect', async () => {
    let storeInstance: Store<InitialState>;
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        storeInstance = store;
        return () => void 0;
      },
    };
    const {actions, error} = await new StoreTester(realParams).run(function* () {
      runAsyncEffect(() => {
        storeInstance.dispatch(sliceActions.setOkStatus());
      });
      yield waitForAction(sliceActions.setOkStatus.type);
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus()]);
  });

  it('should wait for several actions dispatched in runAsyncEffect', async () => {
    let storeInstance: Store<InitialState>;
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        storeInstance = store;
        return () => void 0;
      },
    };
    const {actions, error} = await new StoreTester(realParams).run(function* () {
      runAsyncEffect(() => {
        storeInstance.dispatch(sliceActions.setOkStatus());
        storeInstance.dispatch(sliceActions.setErrorStatus());
      });
      yield waitForAction(sliceActions.setOkStatus.type);
      yield waitForAction(sliceActions.setErrorStatus.type);
    });

    expect(error).toBeUndefined();
    expect(actions).toEqual([sliceActions.setOkStatus(), sliceActions.setErrorStatus()]);
  });

  it('should not catch the action dispatched in runAsyncEffect if action is waited after waitForSyncWorkToFinish', async () => {
    let storeInstance: Store<InitialState>;
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        storeInstance = store;
        return () => void 0;
      },
    };
    const {error} = await new StoreTester(realParams).run(function* () {
      runAsyncEffect(() => {
        storeInstance.dispatch(sliceActions.setOkStatus());
      });
      yield waitForSyncWorkToFinish();
      yield waitForAction(sliceActions.setOkStatus.type);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });

  it('should not catch the action dispatched after Promise.resolve in runAsyncEffect if action is waited after waitForSyncWorkToFinish', async () => {
    let storeInstance: Store<InitialState>;
    const realParams = {
      ...params,
      errorTimoutMs: 10,
      initializeFunction: (store: Store<InitialState>) => {
        storeInstance = store;
        return () => void 0;
      },
    };
    const {error} = await new StoreTester(realParams).run(function* () {
      runAsyncEffect(() => {
        Promise.resolve().then(() => storeInstance.dispatch(sliceActions.setOkStatus()));
      });
      yield waitForSyncWorkToFinish();
      yield waitForAction(sliceActions.setOkStatus.type);
    });

    expect(error).toBeDefined();
    expect(error).toMatchSnapshot();
  });
});
