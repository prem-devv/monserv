module.exports = {
  apps: [
    {
      name: 'monserv-api',
      script: 'apps/api/dist/index.js',
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DB_PATH: 'db.json',
      },
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    {
      name: 'monserv-web',
      script: 'npm',
      args: 'start',
      cwd: './apps/web',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '../../logs/web-error.log',
      out_file: '../../logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};