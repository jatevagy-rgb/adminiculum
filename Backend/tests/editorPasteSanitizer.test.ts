/**
 * Word-paste sanitizer tests. Fixtures are representative Word-generated HTML
 * patterns and contain NO client data. The sanitizer is defense-in-depth; the
 * hard boundary remains the Tiptap schema parse plus the strict validator.
 */

import { externalHtmlToPlainText, sanitizeExternalHtml } from '../../Frontend/src/lib/editor/pasteSanitizer';

const WORD_FIXTURE = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta http-equiv=Content-Type content="text/html; charset=windows-1250">
<style><!--
p.MsoNormal { margin:0cm; font-size:11.0pt; font-family:"Calibri",sans-serif; }
--></style>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml><![endif]-->
</head>
<body lang=HU style='word-wrap:break-word'>
<p class=MsoNormal style='text-align:justify'><b>1. A szerződés tárgya</b><o:p></o:p></p>
<p class=MsoNormal><span style='font-family:"Times New Roman"'>A Megbízott a jelen szerződés alapján ellátja a feladatokat.</span></p>
<ol style='margin-top:0cm' start=1 type=1>
 <li class=MsoNormal style='mso-list:l0 level1 lfo1'>első pont</li>
 <li class=MsoNormal>második pont</li>
</ol>
<ul><li>felsorolás</li></ul>
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse'>
 <tr><td width=301 valign=top style='border:solid windowtext 1.0pt'><p class=MsoNormal>Tétel</p></td>
     <td colspan="2"><p class=MsoNormal>Díj</p></td></tr>
</table>
<p class=MsoNormal><i>dőlt</i> és <u>aláhúzott</u> szöveg&nbsp;&nbsp;&nbsp;itt</p>
</body></html>`;

describe('sanitizeExternalHtml', () => {
  it('preserves paragraphs, formatting, lists and bounded tables', () => {
    const output = sanitizeExternalHtml(WORD_FIXTURE);
    expect(output).toContain('<b>1. A szerződés tárgya</b>');
    expect(output).toContain('A Megbízott a jelen szerződés alapján');
    expect(output).toMatch(/<ol[^>]*>/);
    expect(output).toContain('<li');
    expect(output).toContain('<ul>');
    expect(output).toContain('<table');
    expect(output).toContain('colspan="2"');
    expect(output).toContain('<i>dőlt</i>');
    expect(output).toContain('<u>aláhúzott</u>');
  });

  it('removes Word XML, conditional comments, styles and classes', () => {
    const output = sanitizeExternalHtml(WORD_FIXTURE);
    expect(output).not.toContain('<o:p>');
    expect(output).not.toContain('w:WordDocument');
    expect(output).not.toContain('mso-list');
    expect(output).not.toContain('MsoNormal');
    expect(output).not.toContain('style=');
    expect(output).not.toContain('class=');
    expect(output).not.toContain('<style');
    expect(output).not.toContain('<meta');
    expect(output).not.toContain('Times New Roman');
    expect(output).not.toContain('windowtext');
  });

  it('removes scripts and event-handler attributes', () => {
    const output = sanitizeExternalHtml(
      `<p onclick="steal()">szöveg</p><script>alert(1)</script><p onmouseover='x()'>másik</p>`
    );
    expect(output).not.toContain('script');
    expect(output).not.toContain('onclick');
    expect(output).not.toContain('onmouseover');
    expect(output).toContain('szöveg');
    expect(output).toContain('másik');
  });

  it('removes unsafe link protocols but keeps safe hrefs', () => {
    const output = sanitizeExternalHtml(
      `<a href="javascript:alert(1)">rossz</a> <a href="data:text/html,x">adat</a> <a href="https://example.com">jó</a> <a href="mailto:iroda@example.com">levél</a>`
    );
    expect(output).not.toContain('javascript:');
    expect(output).not.toContain('data:text/html');
    expect(output).toContain('href="https://example.com"');
    expect(output).toContain('href="mailto:iroda@example.com"');
  });

  it('removes iframes, objects, embeds, forms, images and links to stylesheets', () => {
    const output = sanitizeExternalHtml(
      `<iframe src="https://evil"></iframe><object data="x"></object><embed src="x"><form action="/x"><input value="y"></form><img src="data:image/png;base64,AAAA"><link rel="stylesheet" href="x.css"><p>marad</p>`
    );
    expect(output).not.toContain('<iframe');
    expect(output).not.toContain('<object');
    expect(output).not.toContain('<embed');
    expect(output).not.toContain('<form');
    expect(output).not.toContain('<input');
    expect(output).not.toContain('<img');
    expect(output).not.toContain('<link');
    expect(output).not.toContain('base64');
    expect(output).toContain('<p>marad</p>');
  });

  it('unwraps span/font/div wrappers while preserving text', () => {
    const output = sanitizeExternalHtml(`<div><span style="color:red"><font face="Arial">tartalom</font></span></div>`);
    expect(output).toBe('tartalom');
  });

  it('normalizes repeated non-breaking spaces but keeps single ones', () => {
    const output = sanitizeExternalHtml(`<p>2013.&nbsp;évi&nbsp;&nbsp;&nbsp;V.&nbsp;törvény</p>`);
    expect(output).toContain('2013.&nbsp;évi&nbsp;V.&nbsp;törvény');
  });
});

describe('externalHtmlToPlainText (Beillesztés formázás nélkül)', () => {
  it('produces clean plain paragraphs', () => {
    const output = externalHtmlToPlainText(WORD_FIXTURE);
    expect(output).toContain('1. A szerződés tárgya');
    expect(output).toContain('első pont');
    expect(output).not.toContain('<');
    expect(output).not.toContain('&nbsp;');
    expect(output).not.toContain('MsoNormal');
  });

  it('decodes basic entities', () => {
    expect(externalHtmlToPlainText('<p>A &amp; B &lt;C&gt; &quot;D&quot;</p>')).toBe('A & B <C> "D"');
  });
});
