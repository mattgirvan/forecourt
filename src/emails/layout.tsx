/**
 * Forecourt email layout. Email safe: tables, inline styles, 600px max,
 * system fonts, no flex or grid, no CSS background images. The <style> block
 * only adds mobile stacking and dark mode guards; the layout holds without it.
 */
import { Fragment, type ReactNode } from "react";
import { Head, Html, Preview } from "@react-email/components";

export const C = {
  page: "#f2f2ee",
  hero: "#0a0b0a",
  heroText: "#eeeee8",
  eyebrow: "#8b8d86",
  card: "#ffffff",
  text: "#1b1d1b",
  muted: "#4a4d48",
  tile: "#f6f6f2",
  rule: "#4ba82e",
  quote: "#141614",
  amber: "#d9a24b",
  ink: "#20160a",
  foot: "#6a6c66",
  line: "#e3e3dd",
};
export const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const SITE_URL = "https://www.forecourt.me";

export type Block =
  | { t: "p"; text: string }
  | { t: "h2"; text: string }
  | { t: "quote"; text: string }
  | { t: "tiles"; items: { title: string; text: string }[] }
  | { t: "list"; items: string[] }
  | { t: "plans"; items: { name: string; tag: string; sub: string; lines: string[] }[] }
  | { t: "links"; items: { label: string; href: string; why: string }[] }
  | { t: "cta"; label: string; href: string }
  | { t: "sign"; lines: string[] }
  | { t: "small"; text: string };

export type EmailDoc = {
  name: string;
  subject: string;
  preview: string;
  eyebrow: string;
  title: string;
  hero?: { src: string; alt: string; width: number; height: number };
  blocks: Block[];
  /** Confirm mail has no list footer, just the reason and privacy link. */
  footer?: "list" | "confirm";
};

/** **bold** to <strong>, everything else as text. */
function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i} style={{ fontWeight: 700, color: C.text }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const pStyle = { overflowWrap: "anywhere" as const, wordBreak: "break-word" as const, margin: "0 0 18px", fontFamily: FONT, fontSize: "16px", lineHeight: "26px", color: C.text };

function Tile({ title, text }: { title: string; text: string }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "separate" }}>
      <tbody>
        <tr>
          <td
            className="fc-tile"
            style={{ background: C.tile, borderRadius: "10px", borderLeft: `3px solid ${C.rule}`, padding: "16px 16px 16px 15px", verticalAlign: "top" }}
          >
            <p style={{ margin: "0 0 6px", fontFamily: FONT, fontSize: "16px", lineHeight: "22px", fontWeight: 700, color: C.text }}>{title}</p>
            <p style={{ margin: 0, fontFamily: FONT, fontSize: "14px", lineHeight: "21px", color: C.muted }}>{text}</p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Tiles({ items }: { items: { title: string; text: string }[] }) {
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "4px 0 22px" }}>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.length === 1 ? (
              <td className="fc-col" colSpan={3} style={{ paddingBottom: "12px", verticalAlign: "top" }}>
                <Tile {...row[0]} />
              </td>
            ) : (
              <>
                <td className="fc-col" width="49%" style={{ width: "49%", paddingBottom: "12px", verticalAlign: "top" }}>
                  <Tile {...row[0]} />
                </td>
                <td className="fc-gap" width="2%" style={{ width: "2%", fontSize: 0, lineHeight: 0 }}>
                  &nbsp;
                </td>
                <td className="fc-col" width="49%" style={{ width: "49%", paddingBottom: "12px", verticalAlign: "top" }}>
                  <Tile {...row[1]} />
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Button({ label, href }: { label: string; href: string }) {
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="17%" stroke="f" fillcolor="${C.amber}"><w:anchorlock/><center style="color:${C.ink};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center></v:roundrect><![endif]--><!--[if !mso]><!-->`;
  const end = `<!--<![endif]-->`;
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} className="fc-btn-wrap" width="100%" style={{ width: "100%", maxWidth: "280px", margin: "6px 0 24px" }}>
      <tbody>
        <tr>
          <td>
            <div dangerouslySetInnerHTML={{ __html: vml }} />
            <table role="presentation" cellPadding={0} cellSpacing={0} className="fc-btn" width="100%" style={{ width: "100%", maxWidth: "280px" }}>
              <tbody>
                <tr>
                  <td align="center" height="48" style={{ height: "48px", background: C.amber, borderRadius: "8px", textAlign: "center" }} className="fc-amber">
                    <a
                      href={href}
                      style={{ display: "block", lineHeight: "48px", height: "48px", fontFamily: FONT, fontSize: "16px", fontWeight: 700, color: C.ink, textDecoration: "none", borderRadius: "8px" }}
                      className="fc-amber-ink"
                    >
                      {label}
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
            <div dangerouslySetInnerHTML={{ __html: end }} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "4px 0 24px" }}>
      <tbody>
        <tr>
          <td className="fc-dark" style={{ background: C.quote, borderRadius: "10px", padding: "22px 24px" }}>
            <p className="fc-dark-text" style={{ margin: 0, fontFamily: FONT, fontSize: "20px", lineHeight: "28px", fontWeight: 700, color: C.heroText }}>
              {text}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Plans({ items }: { items: { name: string; tag: string; sub: string; lines: string[] }[] }) {
  return (
    <>
      {items.map((p) => (
        <table key={p.name} role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 12px", borderCollapse: "separate" }}>
          <tbody>
            <tr>
              <td style={{ background: C.tile, borderRadius: "10px", borderLeft: `3px solid ${C.rule}`, padding: "18px 18px 16px 17px" }}>
                <table role="presentation" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: FONT, fontSize: "18px", lineHeight: "24px", fontWeight: 700, color: C.text, paddingRight: "10px" }}>{p.name}</td>
                      <td style={{ background: "#e6efe1", borderRadius: "999px", padding: "3px 10px", fontFamily: FONT, fontSize: "12px", lineHeight: "16px", fontWeight: 600, color: "#2f6b1d" }}>{p.tag}</td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ margin: "4px 0 10px", fontFamily: FONT, fontSize: "14px", lineHeight: "20px", color: C.muted }}>{p.sub}</p>
                {p.lines.map((l, i) => (
                  <p key={i} style={{ margin: i === p.lines.length - 1 ? 0 : "0 0 8px", fontFamily: FONT, fontSize: "15px", lineHeight: "23px", color: C.text }}>
                    {rich(l)}
                  </p>
                ))}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
      <div style={{ height: "10px", lineHeight: "10px", fontSize: 0 }}>&nbsp;</div>
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "p":
      return <p style={pStyle}>{rich(b.text)}</p>;
    case "small":
      return <p style={{ ...pStyle, fontSize: "14px", lineHeight: "22px", color: C.muted }}>{rich(b.text)}</p>;
    case "h2":
      return <h2 style={{ overflowWrap: "anywhere", wordBreak: "break-word", margin: "28px 0 10px", fontFamily: FONT, fontSize: "20px", lineHeight: "26px", fontWeight: 700, color: C.text }}>{b.text}</h2>;
    case "quote":
      return <Quote text={b.text} />;
    case "tiles":
      return <Tiles items={b.items} />;
    case "plans":
      return <Plans items={b.items} />;
    case "list":
      return (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 18px" }}>
          <tbody>
            {b.items.map((it, i) => (
              <tr key={i}>
                <td width="22" style={{ width: "22px", verticalAlign: "top", fontFamily: FONT, fontSize: "16px", lineHeight: "26px", color: C.rule, fontWeight: 700 }}>&bull;</td>
                <td style={{ fontFamily: FONT, fontSize: "16px", lineHeight: "26px", color: C.text, paddingBottom: "6px" }}>{rich(it)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "links":
      return (
        <>
          {b.items.map((l, i) => (
            <p key={i} style={{ ...pStyle, margin: "0 0 12px" }}>
              <a href={l.href} style={{ color: "#2f6b1d", fontWeight: 700, textDecoration: "underline" }}>
                {l.label}
              </a>
              : {l.why}
            </p>
          ))}
        </>
      );
    case "cta":
      return <Button label={b.label} href={b.href} />;
    case "sign":
      return (
        <p style={{ ...pStyle, margin: "0 0 4px" }}>
          {b.lines.map((l, i) => (
            <Fragment key={i}>
              {i === 1 ? <strong style={{ fontWeight: 700 }}>{l}</strong> : l}
              {i < b.lines.length - 1 ? <br /> : null}
            </Fragment>
          ))}
        </p>
      );
  }
}

const CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
@media only screen and (max-width: 599px) {
  .fc-outer { padding: 0 !important; }
  .fc-pad { padding-left: 24px !important; padding-right: 24px !important; }
  .fc-h1 { font-size: 26px !important; line-height: 32px !important; }
  .fc-col { display: block !important; width: 100% !important; }
  .fc-gap { display: none !important; }
  .fc-btn-wrap, .fc-btn { width: 100% !important; }
  .fc-card { border-radius: 0 !important; }
}
@media (prefers-color-scheme: dark) {
  .fc-dark { background: #0a0b0a !important; }
  .fc-dark-text { color: #eeeee8 !important; }
  .fc-amber { background: #d9a24b !important; }
  .fc-amber-ink { color: #20160a !important; }
}
[data-ogsc] .fc-dark { background: #0a0b0a !important; }
[data-ogsc] .fc-dark-text, [data-ogsb] .fc-dark-text { color: #eeeee8 !important; }
[data-ogsc] .fc-amber { background: #d9a24b !important; }
[data-ogsc] .fc-amber-ink { color: #20160a !important; }
`;

export function Email({ doc }: { doc: EmailDoc }) {
  const footer = doc.footer ?? "list";
  return (
    <Html lang="en-GB">
      <Head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>{doc.subject}</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </Head>
      <body style={{ margin: 0, padding: 0, background: C.page }}>
        <Preview>{doc.preview}</Preview>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ background: C.page }}>
          <tbody>
            <tr>
              <td align="center" className="fc-outer" style={{ padding: "24px 12px" }}>
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  className="fc-card"
                  style={{ maxWidth: "600px", width: "100%", background: C.card, borderRadius: "12px", overflow: "hidden", borderCollapse: "separate" }}
                >
                  <tbody>
                    <tr>
                      <td className="fc-dark fc-pad" style={{ background: C.hero, padding: "28px 32px 26px", borderRadius: "12px 12px 0 0" }}>
                        <table role="presentation" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td style={{ paddingRight: "8px", verticalAlign: "middle" }}>
                                <img src={`${SITE_URL}/mark.png`} width="22" height="22" alt="" style={{ display: "block", border: 0, borderRadius: "5px" }} />
                              </td>
                              <td className="fc-dark-text" style={{ fontFamily: FONT, fontSize: "17px", lineHeight: "22px", fontWeight: 700, color: C.heroText, verticalAlign: "middle" }}>
                                Forecourt
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <p style={{ margin: "30px 0 10px", fontFamily: FONT, fontSize: "12px", lineHeight: "16px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.eyebrow }}>
                          {doc.eyebrow}
                        </p>
                        <h1 className="fc-h1 fc-dark-text" style={{ overflowWrap: "anywhere", wordBreak: "break-word", margin: 0, fontFamily: FONT, fontSize: "30px", lineHeight: "36px", fontWeight: 700, color: C.heroText }}>
                          {doc.title}
                        </h1>
                      </td>
                    </tr>
                    {doc.hero ? (
                      <tr>
                        <td className="fc-dark" style={{ background: C.hero, padding: 0 }}>
                          <img
                            src={doc.hero.src}
                            width="600"
                            alt={doc.hero.alt}
                            style={{ display: "block", width: "100%", maxWidth: "600px", height: "auto", border: 0, color: C.heroText, fontFamily: FONT, fontSize: "14px" }}
                          />
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      <td className="fc-pad" style={{ background: C.card, padding: "32px 32px 12px" }}>
                        {doc.blocks.map((b, i) => (
                          <BlockView key={i} b={b} />
                        ))}
                      </td>
                    </tr>
                    <tr>
                      <td className="fc-pad" style={{ background: C.card, padding: "0 32px 28px" }}>
                        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td style={{ borderTop: `1px solid ${C.line}`, paddingTop: "18px", fontFamily: FONT, fontSize: "13px", lineHeight: "20px", color: C.foot }}>
                                <p style={{ margin: "0 0 6px" }}>Built in Scotland for UK motor trade desks.</p>
                                <p style={{ margin: "0 0 6px" }}>Forecourt, 279 Clifton Road, Aberdeen, AB24 4HL</p>
                                {footer === "list" ? (
                                  <p style={{ margin: 0 }}>
                                    You&apos;re receiving this because you signed up for Forecourt updates at forecourt.me and confirmed by email.{" "}
                                    <a href="{{UNSUBSCRIBE_URL}}" style={{ color: C.foot, textDecoration: "underline", display: "inline-block", padding: "12px 0", lineHeight: "20px" }}>
                                      Unsubscribe
                                    </a>
                                  </p>
                                ) : (
                                  <p style={{ margin: 0 }}>
                                    You&apos;re receiving this because someone asked to subscribe this address at forecourt.me. If it was not you, ignore it and nothing happens.{" "}
                                    <a href={`${SITE_URL}/privacy`} style={{ color: C.foot, textDecoration: "underline", display: "inline-block", padding: "12px 0", lineHeight: "20px" }}>
                                      Privacy notice
                                    </a>
                                  </p>
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </Html>
  );
}
