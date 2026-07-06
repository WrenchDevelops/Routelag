import { useCallback, useEffect, useMemo, useState } from "react";

import { InstallerShell, FooterButtons } from "./components/InstallerShell";

import { useToast } from "./components/Toast";

import { WelcomePage } from "./pages/WelcomePage";

import { InstallTypePage } from "./pages/InstallTypePage";

import { ComponentsPage } from "./pages/ComponentsPage";

import { LocationPage } from "./pages/LocationPage";

import { ReadyPage } from "./pages/ReadyPage";

import { InstallingPage } from "./pages/InstallingPage";
import { ProgressPage } from "./pages/ProgressPage";

import { CompletePage } from "./pages/CompletePage";

import { AddHudPage } from "./pages/AddHudPage";

import { UninstallConfirmPage } from "./pages/UninstallConfirmPage";

import {

  WIZARD_STEPS,

  backendInstallType,

  componentsFromInstallType,

  estimateInstallSize,

  type ComponentSelection,

} from "./lib/installState";

import {

  installerApi,

  type InstallType,

  type PayloadManifest,

  type ProgressLine,

  type ExistingInstall,

} from "./lib/installerApi";

import { getCurrentWindow } from "@tauri-apps/api/window";



type Flow = "loading" | "wizard" | "addHud" | "uninstall";

type WizardStep = "welcome" | "installType" | "components" | "location" | "ready" | "installing" | "complete";

type AddHudStep = "addHud" | "installing" | "complete";

type UninstallStep = "confirm" | "uninstalling" | "complete";



const FALLBACK_MANIFEST: PayloadManifest = {

  version: "0.0.0",

  hudIncluded: false,

  appSizeBytes: 0,

  engineSizeBytes: 0,

  hudSizeBytes: 0,

};



function stepperStep(wizardStep: WizardStep): string {
  if (wizardStep === "ready" || wizardStep === "installing" || wizardStep === "complete") {
    return "finish";
  }
  return wizardStep;
}



export default function App() {

  const { showToast } = useToast();



  const [flow, setFlow] = useState<Flow>("loading");

  const [manifest, setManifest] = useState<PayloadManifest>(FALLBACK_MANIFEST);

  const [existingInstall, setExistingInstall] = useState<ExistingInstall | null>(null);

  const [installDir, setInstallDir] = useState("");

  const [availableSpaceBytes, setAvailableSpaceBytes] = useState<number | null>(null);



  const [wizardStep, setWizardStep] = useState<WizardStep>("welcome");

  const [installType, setInstallType] = useState<InstallType>("baseAppHud");

  const [viaCustomize, setViaCustomize] = useState(false);

  const [selection, setSelection] = useState<ComponentSelection>(

    componentsFromInstallType("baseAppHud", false),

  );

  const [launchAfterInstall, setLaunchAfterInstall] = useState(true);

  const [hudOnlyAcknowledged, setHudOnlyAcknowledged] = useState(false);

  const [openGuide, setOpenGuide] = useState(false);



  const [addHudStep, setAddHudStep] = useState<AddHudStep>("addHud");

  const [uninstallStep, setUninstallStep] = useState<UninstallStep>("confirm");

  const [removeUserData, setRemoveUserData] = useState(false);

  const [progress, setProgress] = useState<ProgressLine | null>(null);



  useEffect(() => {

    (async () => {

      try {

        const mode = await installerApi.getMode();

        const dir = await installerApi.defaultInstallDir();

        setInstallDir(dir);



        let manifestData = FALLBACK_MANIFEST;

        try {

          manifestData = await installerApi.getManifest();

        } catch (error) {

          showToast(`Could not load release manifest: ${String(error)}`, "error");

        }

        setManifest(manifestData);



        const existing = await installerApi.getExistingInstall();

        setExistingInstall(existing);

        const defaultType: InstallType = manifestData.hudIncluded ? "baseAppHud" : "baseApp";

        setInstallType(defaultType);

        setSelection(componentsFromInstallType(defaultType, manifestData.hudIncluded));



        if (mode === "uninstall") {

          setFlow("uninstall");

          setUninstallStep("confirm");

          if (existing) setInstallDir(existing.installPath);

          return;

        }



        if (existing && manifestData.hudIncluded && !existing.hudRuntimeInstalled) {

          setFlow("addHud");

          setAddHudStep("addHud");

          setInstallDir(existing.installPath);

          return;

        }



        setFlow("wizard");

        setWizardStep("welcome");

      } catch (error) {

        showToast(`Failed to start the installer: ${String(error)}`, "error");

      }

    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []);



  useEffect(() => {

    if (!installDir) return;

    void installerApi

      .getDiskSpace(installDir)

      .then(setAvailableSpaceBytes)

      .catch(() => setAvailableSpaceBytes(null));

  }, [installDir]);



  useEffect(() => {

    const unlistenPromise = installerApi.onProgress((line) => {

      setProgress(line);

      if (line.done && !line.success && line.error) {

        showToast(line.error, "error");

      }

    });

    return () => {

      void unlistenPromise.then((unlisten) => unlisten());

    };

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []);



  const isBusy =

    (flow === "wizard" && wizardStep === "installing" && !progress?.done) ||

    (flow === "addHud" && addHudStep === "installing" && !progress?.done) ||

    (flow === "uninstall" && uninstallStep === "uninstalling" && !progress?.done);



  useEffect(() => {

    document.documentElement.classList.toggle("is-busy", isBusy);

  }, [isBusy]);



  const exitInstaller = useCallback(() => {
    void installerApi.exitApp().catch(() => {
      void getCurrentWindow()
        .close()
        .catch(() => {
          window.close();
        });
    });
  }, []);



  const handleInstallTypeChange = (type: InstallType) => {

    setInstallType(type);

    setViaCustomize(false);

    setSelection(componentsFromInstallType(type, manifest.hudIncluded));

    if (type === "hudOnly") {

      setHudOnlyAcknowledged(false);

      void installerApi.getExistingInstall().then((existing) => {

        setExistingInstall(existing);

        if (existing?.installPath) setInstallDir(existing.installPath);

      });

    }

  };



  const handleCustomize = () => {

    setViaCustomize(true);

    setSelection(componentsFromInstallType(installType, manifest.hudIncluded));

    setInstallType("custom");

    setWizardStep("components");

  };



  const browseInstallDir = async () => {

    try {

      const picked = await installerApi.browseInstallDir(installDir);

      if (picked) setInstallDir(picked);

    } catch (error) {

      showToast(`Could not open folder picker: ${String(error)}`, "error");

    }

  };



  const startInstall = () => {

    if (installType === "hudOnly" && !existingInstall && !hudOnlyAcknowledged) {

      showToast(

        "RouteLag Base App is required to launch and manage the HUD Runtime. Confirm the manual path before continuing.",

        "error",

      );

      return;

    }

    setWizardStep("installing");

    setProgress(null);

    void installerApi.startInstall({

      installDir,

      installType: backendInstallType(installType),

      includeApp: selection.includeApp,

      includeEngine: selection.includeEngine,

      includeHud: selection.includeHud && manifest.hudIncluded,

      includeDesktopShortcut: selection.includeDesktopShortcut,

      includeStartMenuShortcut: selection.includeStartMenuShortcut,

    });

  };



  const handleWizardFinish = () => {

    if (launchAfterInstall && selection.includeApp) {

      void installerApi.launchApp({ installDir }).catch((error) => {

        showToast(`Could not launch RouteLag: ${String(error)}`, "error");

      });

    }

    exitInstaller();

  };



  const startAddHud = () => {

    setAddHudStep("installing");

    setProgress(null);

    void installerApi.startAddHud({ installDir });

  };



  const startUninstall = () => {

    setUninstallStep("uninstalling");

    setProgress(null);

    void installerApi.startUninstall({ installDir, removeUserData });

  };



  const estimatedSizeBytes = useMemo(

    () =>

      estimateInstallSize(selection, {

        appSizeBytes: manifest.appSizeBytes,

        engineSizeBytes: manifest.engineSizeBytes,

        hudSizeBytes: manifest.hudSizeBytes,

      }),

    [selection, manifest],

  );



  useEffect(() => {

    if (progress?.done && progress.success) {

      if (flow === "wizard" && wizardStep === "installing") setWizardStep("complete");

      if (flow === "addHud" && addHudStep === "installing") setAddHudStep("complete");

      if (flow === "uninstall" && uninstallStep === "uninstalling") setUninstallStep("complete");

    }

  }, [progress, flow, wizardStep, addHudStep, uninstallStep]);



  const shellProps = {

    steps: [...WIZARD_STEPS],

    currentStepId: stepperStep(wizardStep),

  };



  if (flow === "loading") {

    return (

      <div className="app-shell">

        <div className="loading-screen">Starting RouteLag Setup…</div>

      </div>

    );

  }



  if (flow === "uninstall") {

    if (uninstallStep === "confirm") {

      return (

        <InstallerShell showStepper={false} footer={<FooterButtons onCancel={exitInstaller} onNext={startUninstall} nextLabel="Uninstall" />}>

          <UninstallConfirmPage

            installPath={installDir}

            removeUserData={removeUserData}

            onRemoveUserDataChange={setRemoveUserData}

          />

        </InstallerShell>

      );

    }

    if (uninstallStep === "uninstalling") {

      return (

        <InstallerShell

          showStepper={false}

          footer={<FooterButtons onCancel={exitInstaller} cancelLabel="Close" showBack={false} />}

        >

          <ProgressPage

            title="Uninstalling RouteLag"

            message={progress?.message ?? "Removing RouteLag"}

            percent={progress?.percent ?? 0}

            errorMessage={progress?.done && !progress.success ? progress.error : null}

          />

        </InstallerShell>

      );

    }

    return (

      <InstallerShell

        showStepper={false}

        footer={<FooterButtons onNext={exitInstaller} nextLabel="Finish" showBack={false} />}

      >

        <CompletePage title="RouteLag has been removed" subtitle="Uninstall completed successfully." />

      </InstallerShell>

    );

  }



  if (flow === "addHud") {

    if (addHudStep === "addHud") {

      return (

        <InstallerShell

          showStepper={false}

          footer={<FooterButtons onCancel={exitInstaller} onNext={startAddHud} nextLabel="Install HUD Runtime" />}

        >

          <AddHudPage installPath={installDir} hudSizeBytes={manifest.hudSizeBytes} />

        </InstallerShell>

      );

    }

    if (addHudStep === "installing") {

      return (

        <InstallerShell showStepper={false} footer={null}>

          <ProgressPage

            title="Installing HUD Runtime"

            message={progress?.message ?? "Installing HUD Runtime…"}

            percent={progress?.percent ?? 0}

            errorMessage={progress?.done && !progress.success ? progress.error : null}

          />

        </InstallerShell>

      );

    }

    return (

      <InstallerShell

        showStepper={false}

        footer={<FooterButtons onNext={handleWizardFinish} nextLabel="Finish" showBack={false} />}

      >

        <CompletePage

          title="Installation Complete"

          subtitle="RouteLag HUD Runtime has been installed."

          launchOption={{ checked: launchAfterInstall, onChange: setLaunchAfterInstall }}

        >

          <p>You can launch the HUD from inside RouteLag.</p>

        </CompletePage>

      </InstallerShell>

    );

  }



  const completeMessage = () => {

    if (installType === "hudOnly" || (!selection.includeApp && selection.includeHud)) {

      return (

        <>

          <p>RouteLag HUD Runtime has been installed.</p>

          <p>Open RouteLag to launch and manage the HUD.</p>

        </>

      );

    }

    if (selection.includeHud) {

      return (

        <>

          <p>RouteLag HUD Runtime has been installed.</p>

          <p>You can launch the HUD from inside RouteLag.</p>

        </>

      );

    }

    return (

      <p>HUD Runtime was not installed. You can add it later from the HUD page inside RouteLag.</p>

    );

  };



  return (

    <InstallerShell
      {...shellProps}
      welcomeLayout={wizardStep === "welcome"}
      installTypeLayout={wizardStep === "installType"}
      showStepper={wizardStep !== "installing" && wizardStep !== "complete"}

      footer={

        wizardStep === "welcome" ? (

          <FooterButtons

            onCancel={exitInstaller}

            showBack={false}

            onNext={() => setWizardStep("installType")}

            nextLabel="Next"
            showNextArrow

          />

        ) : wizardStep === "installType" ? (

          <FooterButtons

            onCancel={exitInstaller}

            onBack={() => setWizardStep("welcome")}

            onNext={() => setWizardStep("location")}

            nextLabel="Next"
            showNextArrow

          />

        ) : wizardStep === "components" ? (

          <FooterButtons

            onCancel={exitInstaller}

            onBack={() => setWizardStep("installType")}

            onNext={() => setWizardStep("location")}

            nextLabel="Next"
            showNextArrow

          />

        ) : wizardStep === "location" ? (

          <FooterButtons

            onCancel={exitInstaller}

            onBack={() => setWizardStep(viaCustomize ? "components" : "installType")}

            onNext={() => setWizardStep("ready")}

            nextLabel="Next"
            showNextArrow
            nextDisabled={installType === "hudOnly" && !existingInstall && !hudOnlyAcknowledged}

          />

        ) : wizardStep === "ready" ? (

          <FooterButtons

            onBack={() => setWizardStep("location")}

            onNext={startInstall}

            nextLabel="Install"

          />

        ) : wizardStep === "installing" ? (
          <FooterButtons
            onCancel={exitInstaller}
            showBack
            onNext={() => {}}
            nextLabel="Installing..."
            nextDisabled
          />
        ) : (

          <FooterButtons onNext={handleWizardFinish} nextLabel="Finish" showBack={false} />

        )

      }

    >

      {wizardStep === "welcome" && <WelcomePage />}



      {wizardStep === "installType" && (

        <InstallTypePage

          installType={installType}

          hudAvailable={manifest.hudIncluded}

          onChange={handleInstallTypeChange}
          onCustomize={handleCustomize}
        />

      )}



      {wizardStep === "components" && (

        <ComponentsPage

          installType={installType}

          selection={selection}

          onSelectionChange={setSelection}

          installDir={installDir}

          estimatedSizeBytes={estimatedSizeBytes}

        />

      )}



      {wizardStep === "location" && (

        <LocationPage

          installDir={installDir}

          onInstallDirChange={setInstallDir}

          onBrowse={browseInstallDir}

          estimatedSizeBytes={estimatedSizeBytes}

          availableSpaceBytes={availableSpaceBytes}

          installType={installType}

          baseInstallDetected={!!existingInstall}

          hudOnlyAcknowledged={hudOnlyAcknowledged}

          onHudOnlyAcknowledgedChange={setHudOnlyAcknowledged}

        />

      )}



      {wizardStep === "ready" && (

        <ReadyPage

          installDir={installDir}

          installType={installType}

          selection={selection}

          estimatedSizeBytes={estimatedSizeBytes}

        />

      )}



      {wizardStep === "installing" && (
        <InstallingPage
          percent={progress?.percent ?? 0}
          message={progress?.message ?? "Preparing files…"}
          currentStep={progress?.step ?? "prepare"}
          done={progress?.done ?? false}
          errorMessage={progress?.done && !progress.success ? progress.error : null}
          installType={installType}
          selection={selection}
          installDir={installDir}
          estimatedSizeBytes={estimatedSizeBytes}
        />
      )}



      {wizardStep === "complete" && (

        <CompletePage

          title="Installation Complete"

          subtitle="RouteLag has been installed successfully."

          launchOption={

            selection.includeApp ? { checked: launchAfterInstall, onChange: setLaunchAfterInstall } : undefined

          }

          guideOption={{ checked: openGuide, onChange: setOpenGuide }}

        >

          {completeMessage()}

        </CompletePage>

      )}

    </InstallerShell>

  );

}

