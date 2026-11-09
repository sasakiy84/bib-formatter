const server = Bun.serve({ port: 4173, hostname: '127.0.0.1', fetch: () => new Response(Bun.file('dist/index.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) });
console.log(`Listening on ${server.url}`);
