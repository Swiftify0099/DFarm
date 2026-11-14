$ErrorActionPreference = "Continue"
Write-Host "Monitoring for device to become online..."
while ($true) {
    $devs = & adb devices | Out-String
    $match = [regex]::Match($devs, "([^\s]+)\s+device\b")
    if ($match.Success) {
        $devId = $match.Groups[1].Value
        Write-Host "Found ONLINE device: $devId"
        
        Write-Host "Setting reverse port forward..."
        & adb -s $devId reverse tcp:3000 tcp:3000
        & adb -s $devId reverse tcp:4000 tcp:4000
        
        Write-Host "Transferring and installing Registration App..."
        & adb -s $devId push "apks/DFarm-Registration.apk" "/data/local/tmp/reg.apk"
        & adb -s $devId shell pm install -r -d -g "/data/local/tmp/reg.apk"
        
        Write-Host "Transferring and installing Collection App..."
        & adb -s $devId push "apks/DFarm-Collection.apk" "/data/local/tmp/col.apk"
        & adb -s $devId shell pm install -r -d -g "/data/local/tmp/col.apk"
        
        Write-Host "Launching Registration App on your phone..."
        & adb -s $devId shell am start -n com.dfarm.registration/.MainActivity
        
        Write-Host "INSTALLATION COMPLETED SUCCESSFULLY!"
        break
    }
    Start-Sleep -Milliseconds 800
}
