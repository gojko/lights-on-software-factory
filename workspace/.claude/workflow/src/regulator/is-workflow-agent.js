const workflowAgentPrefix = 'workflow-',
	isWorkflowAgent = (context) => (context.agentType ?? '').startsWith(workflowAgentPrefix);

export { isWorkflowAgent };
