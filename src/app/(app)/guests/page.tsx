import { redirect } from 'next/navigation';

export default function GuestsRedirect() {
  redirect('/guest-list/guests');
}
