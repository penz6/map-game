# Real Linux pseudo-terminal regression: line editing must retain prompts and
# passwords must not appear in terminal output. No third-party Python packages.
import errno, os, select, subprocess, sys, time

node, cli, directory, mode = sys.argv[1:]
master, slave = os.openpty()
child = subprocess.Popen([node, cli, 'create-admin'], stdin=slave, stdout=slave, stderr=slave,
                         env={**os.environ, 'DATA_DIR': directory, 'PUBLIC_ORIGIN':'https://game.example.com'})
os.close(slave)
output = bytearray()
def read_until(marker, timeout=8):
    start = len(output)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if select.select([master], [], [], .1)[0]:
            try: data = os.read(master, 8192)
            except OSError as error:
                if error.errno == errno.EIO: break
                raise
            if not data: break
            output.extend(data)
            if marker in output[start:]: return bytes(output[start:])
    raise AssertionError('Expected CLI prompt/output did not arrive: '+repr(marker))
try:
    read_until(b'Administrator username: ')
    if mode == 'cancel':
        os.write(master, b'\x03')
        child.wait(timeout=5)
        assert child.returncode != 0
    else:
        os.write(master, b'x\x7f')
        redraw=read_until(b'Administrator username: ')
        # A redraw must include the nonempty prompt; the old empty-question
        # implementation erases the entire label when backspace is pressed.
        assert b'Administrator username: ' in redraw, 'Username label vanished during line editing'
        os.write(master, b'ptyadmin\n')
        read_until(b'Display name: ')
        os.write(master, b'Terminal Admin\n')
        read_until(b'hidden): ')
        password=b'Only a disposable terminal test password 538'
        os.write(master, password+b'\n')
        read_until(b'Confirm password (hidden): ')
        os.write(master, password+b'\n')
        read_until(b'Administrator created.')
        child.wait(timeout=5)
        assert child.returncode == 0
        assert password not in output, 'Password was echoed to the terminal'
    print('PTY '+mode+' passed')
finally:
    if child.poll() is None:
        child.kill()
        child.wait()
    os.close(master)
