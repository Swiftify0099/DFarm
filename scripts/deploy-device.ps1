$ErrorActionPreference = "Continue"
Write-Host "Checking for device 10BDCS23G6000SG..."
while ($true) {
    $line = & adb devices | Select-String "10BDCS23G6000SG\s+device"
    if ($line) {
        Write-Host "Device 10BDCS23G6000SG is ONLINE!"
        break
    }
    Start-Sleep -Milliseconds 1000
}

Write-Host "Configuring USB port forwarding for backend..."
& adb -s 10BDCS23G6000SG reverse tcp:3000 tcp:3000
& adb -s 10BDCS23G6000SG reverse tcp:4000 tcp:4000

Write-Host "Installing Customer Registration Android App..."
& adb -s 10BDCS23G6000SG install -r -d "apks/DFarm-Registration.apk"

Write-Host "Installing Milk Collection Counter App..."
& adb -s 10BDCS23G6000SG install -r -d "apks/DFarm-Collection.apk"

Write-Host "Launching Registration App..."
& adb -s 10BDCS23G6000SG shell am start -n com.dfarm.registration/.MainActivity

Write-Host "DEPLOYMENT COMPLETED!"
