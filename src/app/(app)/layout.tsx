import Nav from '@/components/Nav';
import MainWrapper from '@/components/MainWrapper';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <MainWrapper>{children}</MainWrapper>
    </>
  );
}
