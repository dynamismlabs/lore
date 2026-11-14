import type { AppProps } from 'next/app';
import { Inter, Newsreader } from 'next/font/google';
import Head from 'next/head';
import Providers from '@/components/Providers';
import '@/styles/globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Newsreader({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  style: ['normal', 'italic'],
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Lore</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="Keep your family’s memories together." />
      </Head>
      {/* On :root so dialogs (portaled to <body>) get the fonts too. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `:root{--font-sans:${sans.style.fontFamily};--font-serif:${serif.style.fontFamily};}`,
        }}
      />
      <Providers>
        <Component {...pageProps} />
      </Providers>
    </>
  );
}
