# Motor data and example airframes

The app bundles one real motor curve per impulse class, downloaded through the
[ThrustCurve API](https://www.thrustcurve.org/info/api.html) on September 10, 2026,
except for the unchanged C6 reference fixture. Original RASP text/comments and
all available source and license metadata are retained in web/motor-data.ts.
“Not specified” means the API did not supply a license; it does not assert public-domain status.

The parser derives burn duration from the final zero-thrust sample and impulse by
integrating the supplied points. Published summary burn times may use a thrust
threshold and therefore differ. Masses and dimensions come from the selected RASP
header, never mixed with a different delay variant or catalog revision. These
are historical simulator records, not claims about current production batches.

The D12 download is tagged “user” by ThrustCurve; its preserved header attributes
the curve to the NAR certification data dated October 3, 2000. It is displayed
as a sourced curve without relabeling its API provenance. Other downloads are
tagged certification or manufacturer data. The C6 source is its certification PDF.

## Bundled records

- **A: Estes A8** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e900000004e3/); cert; license: not specified; file ID 5f4294d20002e900000004e3.
- **B: Estes B6** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e90000000414/); cert; license: not specified; file ID 5f4294d20002e90000000414.
- **C: Estes C6** — [source](https://www.thrustcurve.org/motors/cert/62e14a0ad917b20004b6c840/C6.pdf); cert; license: not specified.
- **D: Estes D12** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e900000004ea/); user; license: not specified; file ID 5f4294d20002e900000004ea.
- **E: AeroTech E30T** — [source](https://www.thrustcurve.org/simfiles/62431a34ee302a00044520da/); cert; license: PD; file ID 62431a34ee302a00044520da.
- **F: AeroTech F52C** — [source](https://www.thrustcurve.org/simfiles/5f5e5a6a1e865c0004c95620/); cert; license: PD; file ID 5f5e5a6a1e865c0004c95620.
- **G: AeroTech G80T** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e90000000448/); cert; license: not specified; file ID 5f4294d20002e90000000448.
- **H: AeroTech H128W** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e9000000000d/); cert; license: PD; file ID 5f4294d20002e9000000000d.
- **I: AeroTech I284W** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e90000000039/); cert; license: PD; file ID 5f4294d20002e90000000039.
- **J: AeroTech J350W-OLD** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e900000002a7/); cert; license: PD; file ID 5f4294d20002e900000002a7.
- **K: AeroTech K550W** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e90000000071/); cert; license: PD; file ID 5f4294d20002e90000000071.
- **L: AeroTech L850W** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e90000000083/); cert; license: PD; file ID 5f4294d20002e90000000083.
- **M: AeroTech M1315W** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e90000000087/); cert; license: PD; file ID 5f4294d20002e90000000087.
- **N: AeroTech N2000W** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e90000000097/); cert; license: PD; file ID 5f4294d20002e90000000097.
- **O: Cesaroni 21062O3400-P** — [source](https://www.thrustcurve.org/simfiles/5f4294d20002e900000007c0/); cert; license: PD; file ID 5f4294d20002e900000007c0.

## Example airframes

These are editable teaching examples, not dimensioned commercial kits or designs
validated for construction. The C6 keeps 70.9 g dry mass, 42 mm body diameter, and
Cd 0.45; its illustrative body and nose lengths are 380 mm and 140 mm.

Other examples use a body diameter of max(25 mm, motor diameter × 2 for casings
up to 24 mm, otherwise × 1.8). Body length is max(9 body diameters, 1.65 motor
lengths). The ogive nose is 2.8 diameters long. Four fins have root/tip chords of
2.5/1.1 diameters, sweep of 1 diameter, span of 1.5 diameters, and an aft offset
of 0.3 diameters. Cd starts at 0.45. Dry mass is seeded as max(18 g, average
thrust / (7 × g₀) − loaded motor mass) to give a useful illustrative thrust-to-weight
ratio, not inferred structural mass. Geometry edits leave entered mass and Cd
independent. Custom rail lengths persist across class changes.

## Refreshing data

Use the retained motor IDs with /api/v1/download.json?motorIds=ID&format=RASP&data=file.
Keep the original text and attribution. Validate every replacement with parseEng,
check the integrated impulse class, and run the catalog/playback tests. Never
repair invalid sample times or rescale a curve to match a marketed designation.
