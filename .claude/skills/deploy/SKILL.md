---
name: deploy
description: Build the climate-analyzer frontend and deploy to Unraid at 192.168.1.13:8400
---

Build the frontend and deploy to Unraid. Execute these steps in order:

1. Build the frontend:
   ```
   cd D:/Users/kchri/Documents/GitHub/climate-analyzer/frontend && pnpm build
   ```
   Stop if the build fails.

2. SCP the dist folder to Unraid:
   ```python
   import subprocess
   r = subprocess.run([
     "scp", "-i", "/c/Users/kchri/.ssh/id_rsa", "-o", "StrictHostKeyChecking=no", "-r",
     "D:/Users/kchri/Documents/GitHub/climate-analyzer/frontend/dist",
     "root@192.168.1.13:/mnt/user/appdata/climate-analyzer/repo/frontend/"
   ], capture_output=True, text=True)
   print(r.stdout or "SCP OK")
   if r.returncode != 0: print("FAILED:", r.stderr)
   ```

3. Rebuild and restart the Docker container:
   ```python
   import subprocess
   r = subprocess.run([
     "ssh", "-i", "/c/Users/kchri/.ssh/id_rsa", "-o", "StrictHostKeyChecking=no",
     "root@192.168.1.13",
     "cd /mnt/user/appdata/climate-analyzer/repo/docker && docker compose up --build -d 2>&1 | tail -5"
   ], capture_output=True, text=True, timeout=180)
   print(r.stdout)
   ```

4. Verify the site is live:
   ```python
   import urllib.request
   r = urllib.request.urlopen('http://192.168.1.13:8400/', timeout=8)
   print('Live — HTTP', r.status)
   ```

Report the result to the user. If any step fails, stop and report the error.
