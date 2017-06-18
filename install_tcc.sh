#!/bin/sh
echo $(pwd)
rm -rf ./tinycc
rm -rf ./build
git clone git://repo.or.cz/tinycc.git
mkdir build
cd build
../tinycc/configure --prefix=../linux --with-libgcc --disable-static
make all
make install
