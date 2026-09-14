/** Optional WebLLM slot — not bundled. Speech pack falls back to extractive summary. */
export async function CreateMLCEngine(): Promise<never> {
  throw new Error('@mlc-ai/web-llm ist im Web-Build nicht gebündelt.');
}
