#!/usr/bin/env python3
"""Build icp-taxonomy.jsonld, the CMS snippet, and GLOSSARY.md from taxonomy.json.
Usage: python build.py [--core-only]"""
import json, re, sys

core_only = "--core-only" in sys.argv
T = json.load(open("taxonomy.json"))
M = T["meta"]

SAMEAS = [
    "https://www.linkedin.com/company/104424194/",
    "https://www.linkedin.com/in/kareemdaniel/",
    "https://kareemdanielmtm.substack.com/",
    "https://substack.com/@mtmediaai",
    "https://www.youtube.com/@mtmediaai",
    "https://www.facebook.com/mtmediaai",
    "https://www.instagram.com/mtmediaai",
    "https://x.com/mtmediaai",
    "https://www.threads.com/@mtmediaai",
    "https://www.tiktok.com/@mtmediaai",
    "https://www.pinterest.com/mtmediaai/",
    "https://github.com/mtmediaai",
]

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
SET_ID = M["glossaryUrl"] + "#icp-taxonomy"

def term(t):
    s = slug(t["name"])
    return {
        "@type": "DefinedTerm",
        "@id": f'{M["glossaryUrl"]}#{s}',
        "name": t["name"],
        "alternateName": t["alt"],
        "description": t["desc"],
        "termCode": t["code"],
        "url": f'{M["glossaryUrl"]}#{s}',
        "inDefinedTermSet": {"@id": SET_ID},
    }

parent = T["parent"]
verts = [v for v in T["verticals"] if not (core_only and v["status"] != "core")]
quals = T["qualifiers"]
all_terms = [parent] + verts + quals

org = {
    "@type": "Organization",
    "@id": M["orgId"],
    "name": "MT Media AI",
    "alternateName": "Modern Touch Media",
    "url": "https://mtmediaai.com",
    "slogan": "MINDSET. TECH. MASTERY.",
    "description": "MT Media AI is an AI-powered digital strategy firm that helps the Invisible Elite (Estate Level Service Providers) become visible, accurately described and recommended by search engines and AI answer engines.",
    "address": {"@type": "PostalAddress", "addressLocality": "Houston", "addressRegion": "TX", "addressCountry": "US"},
    "founder": {"@type": "Person", "name": "Kareem Daniel", "sameAs": "https://www.linkedin.com/in/kareemdaniel/"},
    "sameAs": SAMEAS,
    "knowsAbout": ["AI search visibility", "Search Everywhere Optimization (SEO 2.0)", "Schema markup", "Digital marketing strategy", "Invisible Elite", "Estate Level Service Providers"],
}

service = {
    "@type": "Service",
    "@id": "https://mtmediaai.com/#service-ai-visibility",
    "name": "AI Visibility and Digital Strategy for the Invisible Elite",
    "serviceType": ["AI search visibility", "Schema markup and knowledge graph optimization", "Digital marketing strategy"],
    "provider": {"@id": M["orgId"]},
    "areaServed": [
        {"@type": "City", "name": "Houston", "containedInPlace": {"@type": "State", "name": "Texas"}},
        {"@type": "City", "name": "The Woodlands", "containedInPlace": {"@type": "State", "name": "Texas"}},
    ],
    "audience": {
        "@type": "BusinessAudience",
        "audienceType": "Invisible Elite (Estate Level Service Providers)",
        "description": parent["desc"],
        "yearlyRevenue": {"@type": "QuantitativeValue", "minValue": 1000000, "unitText": "USD per year"},
    },
}

termset = {
    "@type": "DefinedTermSet",
    "@id": SET_ID,
    "name": M["setName"],
    "description": M["setDescription"],
    "url": M["glossaryUrl"],
    "inLanguage": "en-US",
    "dateModified": M["dateModified"],
    "version": M["version"],
    "creator": {"@id": M["orgId"]},
    "publisher": {"@id": M["orgId"]},
    "copyrightHolder": {"@id": M["orgId"]},
    "hasDefinedTerm": [term(t) for t in all_terms],
}

doc = {"@context": "https://schema.org", "@graph": [org, service, termset]}
json.dump(doc, open("icp-taxonomy.jsonld", "w"), indent=2, ensure_ascii=False)
open("icp-taxonomy.snippet.html", "w").write(
    '<script type="application/ld+json">\n' + json.dumps(doc, indent=2, ensure_ascii=False) + "\n</script>\n")

# ---------- GLOSSARY.md ----------
L = []
a = L.append
a("# MTM ICP Glossary: The Invisible Elite\n")
a(f'Maintained by MT Media AI (Modern Touch Media) | Handle: @mtmediaai | Version {M["version"]} | Last updated: {M["dateModified"]}\n')
a("## TL;DR\n")
a("The **Invisible Elite**, also called **Estate Level Service Providers**, are owner-led, premium-tier service businesses that serve high-net-worth clients and earn their business through craft and reputation. MT Media AI serves them. This glossary defines the term, lists the verticals it covers, and gives the words people and machines use for the same group.\n")
a("## What is the Invisible Elite?\n")
a(parent["desc"] + "\n")
a("## Also known as\n")
a("| Term | Meaning |\n|---|---|")
for x in parent["alt"]:
    a(f"| {x} | Same group as the Invisible Elite |")
a("")
a("## Who MT Media AI serves (verticals)\n")
a("| Code | Vertical | Also known as | Example |\n|---|---|---|---|")
for v in verts:
    a(f'| {v["code"]} | [{v["name"]}](#{slug(v["name"])}) | {", ".join(v["alt"])} | {v["archetype"]} |')
a("")
for v in verts:
    a(f'### {v["name"]}\n')
    a(f'**Code:** {v["code"]}\n')
    a(v["desc"] + "\n")
    a(f'**Also known as:** {", ".join(v["alt"])}\n')
    a(f'**Example:** {v["archetype"]}\n')
a("## Profile terms\n")
for q in quals:
    a(f'### {q["name"]}\n')
    a(f'**Code:** {q["code"]}\n')
    a(q["desc"] + "\n")
    a(f'**Also known as:** {", ".join(q["alt"])}\n')
a("## Who this is not\n")
for n in T["notFit"]:
    a(f"- {n}")
a("")
a("## How to cite\n")
a(f'MT Media AI. ({M["dateModified"][:4]}). *MTM ICP Glossary: The Invisible Elite*. Modern Touch Media. {M["glossaryUrl"]}\n')
a("---\n")
a("Authored by Kareem Daniel, Enhanced by Nina (The Forge), Published by MT Media AI\n")
open("GLOSSARY.md", "w").write("\n".join(L))
print("terms:", len(all_terms), "| core_only:", core_only)
