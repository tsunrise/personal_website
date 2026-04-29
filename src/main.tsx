import ContactGadget from "./components/contact/contact";
import { PrivacyDialog } from "./components/privacy";
import { Salieri } from "./components/salieri/salieri";
import frontImage from "./assets/images/front-image.png";
import wordmark from "./assets/images/wordmark.svg";

function PaintedStencilDefs() {
    return (
        <svg className="svg-defs" aria-hidden="true" focusable="false">
            <filter id="painted-stencil" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="2" seed="7" result="noise" />
                <feColorMatrix
                    in="noise"
                    type="matrix"
                    values="0 0 0 0 0
                            0 0 0 0 0
                            0 0 0 0 0
                            0 0 0 1.6 -0.32"
                    result="alphaNoise"
                />
                <feComposite in="SourceGraphic" in2="alphaNoise" operator="in" />
            </filter>
        </svg>
    );
}

export default function MainGrid() {
    return (
        <main className="site-root">
            <PaintedStencilDefs />

            <section className="hero" aria-label="Pixel art room">
                <img className="hero__image" src={frontImage} alt="" aria-hidden="true" />
            </section>

            <section className="shell" aria-label="Tom Shen personal website">
                <header className="identity">
                    <div className="identity__title-wrap">
                        <h1 className="identity__title">
                            <img className="identity__wordmark" src={wordmark} alt="TOMSHEN.IO" />
                        </h1>
                    </div>
                    <ContactGadget />
                </header>

                <Salieri />

                <footer className="disclaimer">
                    <span>
                        The Salieri System is a language model and may display inaccurate information that does not represent Tom's views.
                        This site is not affiliated with Cloudflare.
                    </span>
                    <span className="footer-meta">
                        © Conghao Shen | <PrivacyDialog /> |{" "}
                        <a className="footer-link" href="https://github.com/tsunrise/personal_website" target="_blank" rel="noreferrer">
                            Source
                        </a>
                    </span>
                </footer>
            </section>
        </main>
    );
}
