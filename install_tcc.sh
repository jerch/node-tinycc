#!/bin/sh
rm -rf ./tinycc
rm -rf ./lib_build
#git clone git://repo.or.cz/tinycc.git
git clone https://github.com/andreiw/tinycc.git
mkdir lib_build
cd lib_build
../tinycc/configure --prefix=../posix --extra-cflags="-fPIC"
make all
make test
make install
