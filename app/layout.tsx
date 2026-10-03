import './styles.css';
export const metadata={
  title:'Smark Mart Console',
  description:'Smark Mart admin and dispatch console',
  icons:{icon:'/favicon.png',shortcut:'/favicon.png',apple:'/smark-mart-icon.png'}
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
