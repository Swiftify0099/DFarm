import os

ninja_file = r'node_modules/react-native-worklets/android/.cxx/RelWithDebInfo/5f4v1c11/arm64-v8a/build.ninja'
with open(ninja_file, 'r', encoding='utf-8') as f:
    c = f.read()

target = '../prefab/arm64-v8a/prefab/lib/aarch64-linux-android/cmake/ReactAndroid/ReactAndroidConfigVersion.cmake'
replacement = 'C$:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/node_modules/react-native-worklets/android/.cxx/RelWithDebInfo/5f4v1c11/prefab/arm64-v8a/prefab/lib/aarch64-linux-android/cmake/ReactAndroid/ReactAndroidConfigVersion.cmake'

if target in c:
    print('Found target in build.ninja!')
    c = c.replace(target, replacement)
    with open(ninja_file, 'w', encoding='utf-8') as f:
        f.write(c)
    print('Replaced!')
