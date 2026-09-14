export function createRequire(_url?: string): ((id: string) => never) & { resolve: (id: string) => never } {
  const req = Object.assign(
    (id: string): never => {
      throw new Error(`createRequire(${id}) ist im Browser nicht verfügbar.`);
    },
    {
      resolve: (id: string): never => {
        throw new Error(`require.resolve(${id}) ist im Browser nicht verfügbar.`);
      },
    },
  );
  return req;
}
