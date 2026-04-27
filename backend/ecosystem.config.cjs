// pm2 process manager config for OutreachOS backend.
// CommonJS (.cjs) because backend/package.json is "type": "module" — pm2
// config files must not be ESM.
//
// Started by deploy/oracle-setup.sh via:
//   pm2 start ecosystem.config.cjs
//
// Env vars are loaded via `node --env-file=...` (node 20.6+) so they are
// populated BEFORE any ES module import runs. This matters because db.js
// reads DATABASE_URL at import time — a server.js-level dotenv.config()
// call would run after the import graph has already evaluated.

module.exports = {
  apps: [
    {
      name: 'outreach-backend',
      script: 'server.js',
      node_args: '--env-file=/home/ubuntu/outreach/.env',
      cwd: '/home/ubuntu/outreach/backend',
      instances: 1,
      exec_mode: 'fork',

      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,
      max_memory_restart: '4G', // 24 GB on the VM, but cap the backend at 4 GB

      // Logging
      out_file: '/var/log/outreach/out.log',
      error_file: '/var/log/outreach/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,

      // Environment (NODE_ENV; rest comes from .env via dotenv in server.js)
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
