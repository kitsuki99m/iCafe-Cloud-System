import logo from "../../assets/aktura-logo.svg";

export default function CustomerSplashScreen({ label = "Checking PC…" }) {
  return (
    <div className="splash-screen" role="status" aria-live="polite">
      <div className="splash-content">
        <div className="splash-ring">
          <img src={logo} alt="Aezakmi Cafe" className="splash-logo" width={64} height={64} />
        </div>
        <div className="splash-text">
          <p className="splash-brand">Aezakmi Cafe</p>
          <p className="splash-label">{label}</p>
        </div>
        <div className="splash-dots" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </div>
  );
}
