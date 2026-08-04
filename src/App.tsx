import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PlayerProvider } from './context/PlayerContext';
import { Layout } from './components/Layout';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SkillCheckMenu } from './features/skillcheck/SkillCheckMenu';
import { AroundTheClock } from './features/skillcheck/AroundTheClock';
import { Bobs27 } from './features/skillcheck/Bobs27';
import { CricketCountUp } from './features/skillcheck/CricketCountUp';
import { Game01 } from './features/skillcheck/Game01';
import { GroupingTest } from './features/skillcheck/GroupingTest';
import { RatingPage } from './features/rating/RatingPage';
import { HistoryPage } from './features/history/HistoryPage';

function App() {
  return (
    <PlayerProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/skillcheck" element={<SkillCheckMenu />} />
            <Route path="/skillcheck/around-the-clock" element={<AroundTheClock />} />
            <Route path="/skillcheck/bobs-27" element={<Bobs27 />} />
            <Route path="/skillcheck/cricket-count-up" element={<CricketCountUp />} />
            <Route path="/skillcheck/game01" element={<Game01 />} />
            <Route path="/skillcheck/grouping" element={<GroupingTest />} />
            <Route path="/rating" element={<RatingPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PlayerProvider>
  );
}

export default App;
