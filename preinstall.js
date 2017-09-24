// build tcc from source on posix systems
if (process.platform !== 'win32') {
    require('child_process').spawnSync('sh', ['install_tcc.sh'], {stdio: 'inherit'});
}
