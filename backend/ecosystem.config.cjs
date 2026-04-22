// pm2 process manager config for OutreachOS backend.
// CommonJS (.cjs) because backend/package.json is "type": "module" — pm2
// config files must not be ESM.
//
// Started by deploy/oracle-setup.sh via:
//   pm2 start ecosystem.config.cjs
//
// The backend's server.js loads /home/ubuntu/outreach/.env itself via dotenv,
// so we don't duplicate env vars here. All config comes from that file.

module.exports = {
  apps: [
    {
      name: 'outreach-backend',
      script: 'server.js',
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
