import { Route, Routes } from "react-router-dom";
import { SinoWorkspace, useSinoFullScreen } from "@sinofut/ui";
import { SINO_PERSONAS } from "@sinofut/domain";
import { StudioShell } from "./StudioShell.jsx";
import { Workbench } from "./pages/Workbench.jsx";
import { Library } from "./pages/Library.jsx";
import { ContentTypeLauncher } from "./pages/ContentTypeLauncher.jsx";
import { CanvasPage } from "./pages/CanvasPage.jsx";
import { Production } from "./pages/Production.jsx";
import { Review } from "./pages/Review.jsx";
import { Publish } from "./pages/Publish.jsx";
import { Team } from "./pages/Team.jsx";
import { Settings } from "./pages/Settings.jsx";

export default function App() {
  const { isFullScreenOpen, openFullScreen, closeFullScreen } = useSinoFullScreen();

  if (isFullScreenOpen) {
    return <SinoWorkspace persona={SINO_PERSONAS.studio} variant="overlay" onExit={closeFullScreen} />;
  }

  return (
    <StudioShell onOpenFullScreen={openFullScreen}>
      <Routes>
        <Route path="/" element={<Workbench />} />
        <Route path="/library" element={<Library />} />
        <Route path="/articles" element={<ContentTypeLauncher contentType="公众号文章" showChannels />} />
        <Route path="/short-video" element={<ContentTypeLauncher contentType="短视频" />} />
        <Route path="/drama" element={<ContentTypeLauncher contentType="AI短剧" />} />
        <Route path="/live" element={<ContentTypeLauncher contentType="直播素材" />} />
        <Route path="/avatar" element={<ContentTypeLauncher contentType="数字人" />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/production" element={<Production />} />
        <Route path="/review" element={<Review />} />
        <Route path="/publish" element={<Publish />} />
        <Route path="/team" element={<Team />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </StudioShell>
  );
}
