import Sidebar from "../components/layout/Sidebar";
import Header from "../components/layout/Header";
import Hero from "../components/dashboard/Hero";

function Dashboard() {
  return (
    <div className="app">

      <Sidebar />

      <main className="content">

        <Header />

        <div style={{ marginTop: "24px" }}>
          <Hero />
        </div>

      </main>

    </div>
  );
}

export default Dashboard;