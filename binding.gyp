{
    'targets': [
        {
            'target_name': 'tcc',
            'include_dirs': ['<!(node -e "require(\'nan\')")', 'posix/include/'],
            'sources': [
                'src/tcc.cpp',
            ],
            'libraries': [
                '-ltcc',
                '-L../posix/lib/'
            ],
            #'cflags!': [ '-fno-exceptions' ],
            #'cflags_cc!': [ '-fno-exceptions' ],
            'conditions': [
                ['OS=="mac"', {
                    'xcode_settings': {
                        'OTHER_LDFLAGS': [
                            '-ltcc'
                        ]
                    },
                }],
            ]
        },
    ]
}