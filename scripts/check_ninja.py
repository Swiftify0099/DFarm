import os

ninja_file = r'node_modules/react-native-worklets/android/.cxx/RelWithDebInfo/5f4v1c11/arm64-v8a/build.ninja'
ninja_mtime = os.path.getmtime(ninja_file)
dir_path = os.path.dirname(ninja_file)
print(f"build.ninja mtime: {ninja_mtime}")

with open(ninja_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if line.startswith('build build.ninja:'):
            dep_str = line.split(':', 1)[1].replace('RERUN_CMAKE', '').replace('|', '')
            for p in dep_str.split():
                p_clean = p.replace('C$:', 'C:').replace('$', '')
                full = os.path.normpath(os.path.join(dir_path, p_clean))
                if os.path.exists(full):
                    m = os.path.getmtime(full)
                    if m > ninja_mtime:
                        print(f"NEWER: {full} diff={m - ninja_mtime:+.6f}s")
                else:
                    print(f"MISSING: {full}")
