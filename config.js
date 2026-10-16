// Zugangsdaten des Supabase-Projekts.
// Den Key einfach zwischen die beiden Backticks ` ` einfügen – Zeilenumbrüche und Leerzeichen werden automatisch entfernt.
const SUPABASE_URL = 'https://bwrffwzuxxhmgwblwehk.supabase.co';
const SUPABASE_ANON_KEY = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3cmZmd3p1eHhobWd3Ymx3ZWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1MzEwMzgsImV4cCI6MjEwNzEwNzAzOH0.8QhAFjV8cVG6Oylrw5HE1K-Z4WV13nC-X2UGYZNkGv4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
