import { supabase } from './supabase';

export type HouseholdInfo = {
  householdId: string;
  name: string;
  inviteCode: string;
};

export async function getMyHouseholdId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  return data?.household_id ?? null;
}

// inviteCode is the user's OWN personal code. It is derived from their account
// id in the database, so it never changes when they join someone else.
export async function getMyHouseholdInfo(): Promise<HouseholdInfo | null> {
  const householdId = await getMyHouseholdId();
  if (!householdId) return null;

  const { data: household } = await supabase
    .from('households')
    .select('id, name, invite_code')
    .eq('id', householdId)
    .maybeSingle();

  if (!household) return null;

  const { data: myCode } = await supabase.rpc('my_invite_code');

  return {
    householdId: household.id,
    name: household.name,
    inviteCode: (myCode as string) || household.invite_code,
  };
}

// Joins another household and MERGES: everything you added stays yours and
// moves into the shared pantry. All the work happens in one database function.
export async function joinHouseholdByInviteCode(
  code: string,
  fullName: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('join_household', {
    p_code: code.trim(),
    p_full_name: fullName,
  });

  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { error: null };
}