import os

Import("env")


print("")
print("============================================================")
print(" ComarPOS - parche Ethernet ESP32 + W5500")
print("============================================================")

libdeps_dir = env.subst("$PROJECT_LIBDEPS_DIR")
pioenv = env.subst("$PIOENV")

ethernet_dir = os.path.join(
    libdeps_dir,
    pioenv,
    "Ethernet",
    "src"
)

w5100_cpp = os.path.join(
    ethernet_dir,
    "utility",
    "w5100.cpp"
)

w5100_h = os.path.join(
    ethernet_dir,
    "utility",
    "w5100.h"
)

print("Environment :", pioenv)
print("Ethernet dir:", ethernet_dir)
print("============================================================")


def patch_file(path, replacements, label):
    if not os.path.isfile(path):
        print("")
        print("[%s] ERROR: no existe:" % label)
        print("  " + path)
        return False

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    changed = False

    for old, new in replacements:

        if old in content:
            content = content.replace(old, new)
            changed = True

        elif new in content:
            pass

        else:
            print("")
            print("[%s] ADVERTENCIA: no encontre el texto esperado en:" % label)
            print("  " + path)
            print("    Puede haber cambiado la version de Ethernet.")

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

        print("[%s] OK - parche aplicado:" % label)
        print("  " + path)

    else:
        print("[%s] OK - ya estaba parcheado:" % label)
        print("  " + path)

    return True


# ============================================================
# 1. W5500 WRITE
# ============================================================

patch_file(
    w5100_cpp,

    [
        (
            """\t\t} else {
\t\t\tSPI.transfer(cmd, 3);
#ifdef SPI_HAS_TRANSFER_BUF
\t\t\tSPI.transfer(buf, NULL, len);
#else
\t\t\t// TODO: copy 8 bytes at a time to cmd[] and block transfer
\t\t\tfor (uint16_t i=0; i < len; i++) {
\t\t\t\tSPI.transfer(buf[i]);
\t\t\t}
#endif
\t\t}""",

            """\t\t} else {
\t\t\tSPI.transfer(cmd, 3);

\t\t\t// ComarPOS / ESP32-S3 + W5500:
\t\t\t// NO usar SPI.transfer(buf, NULL, len).
\t\t\t// La transferencia por bloques puede corromper bytes
\t\t\t// en buffers grandes en ESP32.
\t\t\t// Se fuerza transferencia byte-a-byte.

\t\t\tfor (uint16_t i = 0; i < len; i++) {
\t\t\t\tSPI.transfer(buf[i]);
\t\t\t}
\t\t}"""
        )
    ],

    "patch-w5500-write"
)


# ============================================================
# 2. W5500 READ
# ============================================================

patch_file(
    w5100_cpp,

    [
        (
            """\t\tSPI.transfer(cmd, 3);
\t\tmemset(buf, 0, len);
\t\tSPI.transfer(buf, len);
\t\tresetSS();
\t}
\treturn len;
}

void W5100Class::execCmdSn""",

            """\t\tSPI.transfer(cmd, 3);

\t\t// ComarPOS / ESP32-S3 + W5500:
\t\t// NO usar SPI.transfer(buf, len).
\t\t// Se fuerza lectura byte-a-byte para evitar
\t\t// corrupción de datos en ESP32.

\t\tfor (uint16_t i = 0; i < len; i++) {
\t\t\tbuf[i] = SPI.transfer(0);
\t\t}

\t\tresetSS();
\t}
\treturn len;
}

void W5100Class::execCmdSn"""
        )
    ],

    "patch-w5500-read"
)


# ============================================================
# 3. SPI SPEED
# ============================================================

patch_file(
    w5100_h,

    [
        (
            "#define SPI_ETHERNET_SETTINGS SPISettings(14000000, MSBFIRST, SPI_MODE0)",

            "#define SPI_ETHERNET_SETTINGS SPISettings(8000000, MSBFIRST, SPI_MODE0)"
        )
    ],

    "patch-w5500-spi-speed"
)


# ============================================================
# 4. VERIFICACION REAL DEL W5500
# ============================================================

print("")
print("============================================================")
print(" Verificando parche Ethernet")
print("============================================================")


if not os.path.isfile(w5100_cpp):
    print("❌ ERROR: no existe w5100.cpp")

else:

    with open(w5100_cpp, "r", encoding="utf-8") as f:
        cpp = f.read()

    # --------------------------------------------------------
    # Buscar bloque W5500 WRITE
    # --------------------------------------------------------

    write_ok = False

    if "for (uint16_t i = 0; i < len; i++) {" in cpp:

        # Verificamos que exista la transferencia byte a byte
        # en la zona del W5500.

        if "SPI.transfer(buf[i]);" in cpp:
            write_ok = True

    if write_ok:
        print("✓ W5500 WRITE: byte-a-byte")
    else:
        print("❌ W5500 WRITE: revisar parche")


    # --------------------------------------------------------
    # Buscar bloque W5500 READ
    # --------------------------------------------------------

    read_ok = False

    if "buf[i] = SPI.transfer(0);" in cpp:
        read_ok = True

    if read_ok:
        print("✓ W5500 READ: byte-a-byte")
    else:
        print("❌ W5500 READ: revisar parche")


# ============================================================
# SPI SPEED
# ============================================================

if os.path.isfile(w5100_h):

    with open(w5100_h, "r", encoding="utf-8") as f:
        header = f.read()

    if "SPISettings(8000000, MSBFIRST, SPI_MODE0)" in header:
        print("✓ SPI Ethernet: 8 MHz")
    else:
        print("❌ SPI Ethernet: revisar velocidad")


print("============================================================")
print(" Parche Ethernet finalizado")
print("============================================================")
print("")