export default function WelcomeHeader({ name }) {
  return (
    <div>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
        Welcome back, {name}
      </h1>
    </div>
  );
}