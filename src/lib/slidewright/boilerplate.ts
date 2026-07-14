// Foxit Slidewright — fixed OOXML parts.
//
// Every .pptx needs a theme, a slide master, at least one slide layout, and the
// presentation-level property parts. Their content is standard Office boilerplate
// (the canonical color/font/format scheme + an empty master/layout) — not specific
// to any deck. We author minimal-but-valid versions here so PowerPoint accepts the
// package. Per-deck content lives in the slides, generated elsewhere.

import { XML_DECL } from './xml';

const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const P_NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

/** The 9-level default text style block shared by presentation.xml, the master's
 *  otherStyle, etc. Nine `<a:lvlNpPr>` each with an 1800-centipoint default run. */
function textStyleLevels(indentStep = 457_200, withBullets = false): string {
  let out = '';
  for (let i = 1; i <= 9; i++) {
    const marL = withBullets ? [342_900, 742_950, 1_143_000, 1_600_200, 2_057_400, 2_514_600, 2_971_800, 3_429_000, 3_886_200][i - 1] : indentStep * (i - 1);
    out +=
      `<a:lvl${i}pPr marL="${marL}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
      `<a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>` +
      `<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${i}pPr>`;
  }
  return out;
}

/** The canonical Office theme (clrScheme + fontScheme + fmtScheme). Fonts default
 *  to Calibri; per-run typefaces on the slides override this, so the theme font is
 *  only a fallback. Required structure: 12 colors, major/minor fonts, and the four
 *  format style lists (fill/line/effect/bgFill) each with ≥3 entries. */
export function themeXml(): string {
  const phFill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const ln = (w: number) =>
    `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${phFill}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return (
    XML_DECL +
    `<a:theme ${A_NS} name="Compose Theme"><a:themeElements>` +
    `<a:clrScheme name="Compose">` +
    `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="44546A"/></a:dk2>` +
    `<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
    `<a:accent1><a:srgbClr val="4472C4"/></a:accent1>` +
    `<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>` +
    `<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>` +
    `<a:accent4><a:srgbClr val="FFC000"/></a:accent4>` +
    `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>` +
    `<a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
    `<a:hlink><a:srgbClr val="0563C1"/></a:hlink>` +
    `<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>` +
    `</a:clrScheme>` +
    `<a:fontScheme name="Compose">` +
    `<a:majorFont><a:latin typeface="Calibri Light" panose="020F0302020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="Calibri" panose="020F0502020204030204"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>` +
    `</a:fontScheme>` +
    `<a:fmtScheme name="Compose">` +
    `<a:fillStyleLst>${phFill}${phFill}${phFill}</a:fillStyleLst>` +
    `<a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>` +
    `<a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0">` +
    `<a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst>${phFill}${phFill}${phFill}</a:bgFillStyleLst>` +
    `</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );
}

/** The master's title/body/other text-style block (shared by the default blank
 *  master and any custom master). */
export function masterTxStyles(): string {
  const titleStyle =
    `<p:titleStyle><a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
    `<a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200">` +
    `<a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>`;
  const bodyStyle = `<p:bodyStyle>${textStyleLevels(457_200, true)}</p:bodyStyle>`;
  const otherStyle = `<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${textStyleLevels()}</p:otherStyle>`;
  return `${titleStyle}${bodyStyle}${otherStyle}`;
}

/** The standard presentation color map (bg/tx/accent → theme slots). Shared by the
 *  default and custom masters. */
export const STD_CLR_MAP =
  `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`;

/** The slide master: an empty shape tree, the standard color map, one layout, and
 *  title/body/other text styles. */
export function slideMasterXml(): string {
  return (
    XML_DECL +
    `<p:sldMaster ${A_NS} ${R_NS} ${P_NS}>` +
    `<p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `</p:spTree></p:cSld>` +
    STD_CLR_MAP +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles>${masterTxStyles()}</p:txStyles>` +
    `</p:sldMaster>`
  );
}

/** A single blank slide layout (type "blank"), preserving the master's background. */
export function slideLayoutXml(): string {
  return (
    XML_DECL +
    `<p:sldLayout ${A_NS} ${R_NS} ${P_NS} type="blank" preserve="1">` +
    `<p:cSld name="Blank"><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  );
}

export function presPropsXml(): string {
  return XML_DECL + `<p:presentationPr ${A_NS} ${R_NS} ${P_NS}/>`;
}

export function viewPropsXml(): string {
  return XML_DECL + `<p:viewPr ${A_NS} ${R_NS} ${P_NS}/>`;
}

export function tableStylesXml(): string {
  return (
    XML_DECL +
    `<a:tblStyleLst ${A_NS} def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`
  );
}

export function corePropsXml(title: string, author: string, isoDate: string, subject?: string, revision?: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    XML_DECL +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator>` +
    (subject ? `<dc:subject>${esc(subject)}</dc:subject>` : '') +
    `<cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>` +
    (revision ? `<cp:revision>${esc(revision)}</cp:revision>` : '') +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

export function appPropsXml(slideCount: number, notesCount = 0, company?: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    XML_DECL +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<TotalTime>0</TotalTime><Words>0</Words><Application>Foxit Slidewright</Application>` +
    `<PresentationFormat>Widescreen</PresentationFormat><Paragraphs>0</Paragraphs>` +
    `<Slides>${slideCount}</Slides><Notes>${notesCount}</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips>` +
    `<ScaleCrop>false</ScaleCrop>` +
    (company ? `<Company>${esc(company)}</Company>` : '') +
    `<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc>` +
    `<HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion>` +
    `</Properties>`
  );
}

const NOTES_NS = `${A_NS} ${R_NS} ${P_NS}`;

/** The notes master (one per deck): placeholders for the slide image + notes body,
 *  the color map, and the 9-level notes text style. */
export function notesMasterXml(): string {
  const grp = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
  const sldImg = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="1143000" y="685800"/><a:ext cx="4572000" cy="2743200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>`;
  const body = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="685800" y="3886200"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  return (
    XML_DECL +
    `<p:notesMaster ${NOTES_NS}><p:cSld><p:spTree>${grp}${sldImg}${body}</p:spTree></p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:notesStyle>${textStyleLevels()}</p:notesStyle></p:notesMaster>`
  );
}

/** A notes slide for one slide, carrying the speaker-notes text. */
export function notesSlideXml(notes: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const grp = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
  const sldImg = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>`;
  const paras = notes.split('\n').map((line) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(line)}</a:t></a:r></a:p>`).join('');
  const body = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
  return (
    XML_DECL +
    `<p:notes ${NOTES_NS}><p:cSld><p:spTree>${grp}${sldImg}${body}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
  );
}
