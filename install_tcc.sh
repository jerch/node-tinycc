#!/bin/sh
rm -rf ./tinycc
rm -rf ./lib_build
#git clone git://repo.or.cz/tinycc.git
#git clone https://github.com/andreiw/tinycc.git
git clone git@github.com:TinyCC/tinycc.git
# tested with commit 4fccaf61241a5eb72b0777b3a44bd7abbea48604
mkdir lib_build
cd lib_build
../tinycc/configure --prefix=../posix --extra-cflags="-fPIC"
make all
#make test
make install
