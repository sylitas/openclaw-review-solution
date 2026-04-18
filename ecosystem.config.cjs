module.exports = {
  apps: [
    {
      name: 'openclaw-reviewd',
      script: 'src/daemon/reviewd.js',
      cwd: __dirname,
      interpreter: 'node',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
