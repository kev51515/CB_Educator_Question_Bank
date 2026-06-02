from bs4 import BeautifulSoup

with open("page_source.html", "r") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

print("--- DROPDOWN ANALYSIS ---")
# Find labels
labels = soup.find_all("label")
for label in labels:
    print(f"Label: {label.get_text().strip()}")
    # Find sibling or child controls
    control = label.find_next_sibling()
    if control:
        print(f"  Sibling: {control.name} class={control.get('class')} id={control.get('id')}")
        print(f"  Inner HTML snippet: {str(control)[:200]}...")

# Analyze for Modals/Overlays via Role
print("\n--- MODALS VIA ROLE ---")
roles = soup.find_all(attrs={"role": ["dialog", "alertdialog"]})
for r in roles:
    print(f"Role '{r['role']}': tag={r.name} class={r.get('class')} aria-label={r.get('aria-label')}")
    print(f"  Text: {r.get_text().strip()[:100]}")

print("\n--- BUTTONS WITH 'CLOSE' OR 'SKIP' ---")
buttons = soup.find_all("button")
for b in buttons:
    text = b.get_text().strip().lower()
    if any(x in text for x in ["close", "skip", "next", "got it", "dismiss"]):
        print(f"Button: text='{text}' class={b.get('class')}")

# Look for custom dropdown triggers (e.g. role=combobox, button)
print("\n--- CUSTOM TRIGGERS ---")
combos = soup.find_all(attrs={"role": "combobox"})
for c in combos:
    print(f"Combobox: tag={c.name} class={c.get('class')} aria-label={c.get('aria-label')} aria-controls={c.get('aria-controls')}")
    print(f"  Text: {c.get_text().strip()}")
