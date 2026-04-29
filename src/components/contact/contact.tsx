import { useState } from "react";
import GitHubIcon from "@mui/icons-material/GitHub";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import WechatIcon from "../../images/icons/wechat";
import wechatQRCode from "../../images/qr-code.svg";

const githubLink = "https://github.com/tsunrise";
const linkedinLink = "https://www.linkedin.com/in/conghao-shen/";

export default function ContactGadget() {
    const [wechatOpen, setWechatOpen] = useState(false);

    return (
        <div className="contact-gadget" aria-label="Social links">
            <nav className="socials">
                <a className="social-link social-link--active" href={githubLink} target="_blank" rel="noreferrer" aria-label="GitHub">
                    <GitHubIcon />
                </a>
                <a className="social-link" href={linkedinLink} target="_blank" rel="noreferrer" aria-label="LinkedIn">
                    <LinkedInIcon />
                </a>
                <button
                    className={`social-link social-link--button ${wechatOpen ? "social-link--open" : ""}`}
                    type="button"
                    aria-label="WeChat"
                    aria-pressed={wechatOpen}
                    onClick={() => setWechatOpen((open) => !open)}
                >
                    <WechatIcon />
                </button>
            </nav>

            {wechatOpen && (
                <section className="wechat-card" aria-label="WeChat QR code">
                    <img className="wechat-card__qr" src={wechatQRCode} alt="WeChat QR code" />
                    <div className="wechat-card__hint">Scan with WeChat</div>
                </section>
            )}
        </div>
    );
}
