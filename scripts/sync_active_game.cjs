// scripts/sync_active_game.cjs - CommonJS wrapper for compatibility
(async () => {
  const { main } = await import('./sync_active_game.js');
  await main();
})();
