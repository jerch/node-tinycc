#!/bin/sh
rm -rf ./tinycc
rm -rf ./lib_build
git clone git://repo.or.cz/tinycc.git
mkdir lib_build
cd lib_build
../tinycc/configure --prefix=../posix --with-libgcc --extra-cflags="-fPIC"
make all
make install
