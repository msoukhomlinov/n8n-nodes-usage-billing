@echo off
if "%~1"=="" (
    echo Usage: release ^<version^> ^<message^>
    echo Example: release v1.1.0 "Fixed calculation bug"
    exit /b 1
)
if "%~2"=="" (
    echo Usage: release ^<version^> ^<message^>
    echo Example: release v1.1.0 "Fixed calculation bug"
    exit /b 1
)

git add .
git commit -m "%~2"
git tag -a %~1 -m "%~2"
git push origin main --tags

echo.
echo Released %~1 successfully!
