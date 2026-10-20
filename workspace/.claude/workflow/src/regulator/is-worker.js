const isWorker = (context) => context.agentType === 'workflow-worker';

export { isWorker };
