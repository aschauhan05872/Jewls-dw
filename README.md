# Jewls-dw

Two local Node apps live in this repo:

| App | Folder | Start |
|-----|--------|--------|
| **Med Doorshipp** (medicine store) | `medical-store/` | `medical-store\start.bat` |
| Jewelry store | `jewelry-store/` | `jewelry-store\start.bat` |

## Run Med Doorshipp on Windows

```bat
mkdir "C:\Individual Projects" 2>nul
cd /d "C:\Individual Projects"
git clone https://github.com/aschauhan05872/Jewls-dw.git
cd Jewls-dw\medical-store
start.bat
```

If you already cloned earlier, update instead:

```bat
cd /d "C:\Individual Projects\Jewls-dw"
git pull origin main
cd medical-store
start.bat
```

Then open: **http://127.0.0.1:8080**

## Jewelry store

```bat
cd /d "C:\Individual Projects\Jewls-dw\jewelry-store"
start.bat
```

> Only one app can use port 8080 at a time. Stop one before starting the other.
