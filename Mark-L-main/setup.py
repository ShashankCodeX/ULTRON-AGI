import subprocess
import sys
import platform
from pathlib import Path

print("Installing requirements...")
subprocess.run([sys.executable, "-m", "pip", "install", "--trusted-host", "pypi.python.org", "--trusted-host", "pypi.org", "--trusted-host", "files.pythonhosted.org", "-r", "requirements.txt", "--no-cache-dir"], check=True)

print("Installing Playwright browsers...")
subprocess.run([sys.executable, "-m", "pip", "install", "--trusted-host", "pypi.python.org", "--trusted-host", "pypi.org", "--trusted-host", "files.pythonhosted.org", "--upgrade", "playwright", "--no-cache-dir"], check=True)
subprocess.run([sys.executable, "-m", "playwright", "install"], check=True)

if platform.system() == "Windows":
    try:
        import win32com.client  # noqa: F401
    except ImportError:
        postinstall = Path(sys.executable).parent / "Scripts" / "pywin32_postinstall.py"
        print(
            "\n⚠️  pywin32 did not install correctly — desktop shortcut creation "
            "will fall back to a slower method that may not work on this machine.\n"
            "    Try fixing it manually with:\n"
            f'    "{sys.executable}" -m pip install --force-reinstall pywin32\n'
            f'    "{sys.executable}" "{postinstall}" -install\n'
        )

print("\n✅ Setup complete! Run 'python main.py' to start MARK L.")

