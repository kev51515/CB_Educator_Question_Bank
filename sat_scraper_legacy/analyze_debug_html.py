from bs4 import BeautifulSoup
import os

file_path = "debug_after_assessment.html"
with open(file_path, "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

# Find label "Section"
labels = soup.find_all("label")
for l in labels:
    if "Section" in l.get_text():
        print("FOUND LABEL:", l)
        # Print next sibling
        sibling = l.find_next_sibling()
        if sibling:
            print("SIBLING:", sibling.prettify()[:1000])
        parent = l.parent
        print("PARENT:", parent.prettify()[:500])

# Find select with aria-label
selects = soup.find_all("select")
for s in selects:
    print("SELECT ARIA:", s.get("aria-label"))
    print("SELECT PARENT:", s.parent.prettify()[:500])
