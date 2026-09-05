import { supabase } from './supabase';

export async function getMyHouseholdId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return data?.household_id ?? null;
}

export type HouseholdInfo = {
  householdId: string;
  name: string;
  inviteCode: string;
};

export async function getMyHouseholdInfo(): Promise<HouseholdInfo | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return null;

  const { data: household } = await supabase
    .from('households')
    .select('name, invite_code')
    .eq('id', membership.household_id)
    .maybeSingle();

  if (!household) return null;

  return {
    householdId: membership.household_id,
    name: household.name,
    inviteCode: household.invite_code,
  };
}

// Moves the logged-in person into an existing household found by invite code —
// and brings along anything they'd already added (pantry items, shopping list
// entries, waste log history) so joining a family never loses their own data.
export async function joinHouseholdByInviteCode(
  code: string,
  fullName: string
): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not logged in.' };

  const { data: newHousehold, error: findError } = await supabase
    .from('households')
    .select('id')
    .eq('invite_code', code.trim().toUpperCase())
    .maybeSingle();

  if (findError || !newHousehold) {
    return { error: 'No household found with that invite code. Double-check and try again.' };
  }

  // Find their current (old) household before we switch away from it
  const { data: oldMembership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const oldHouseholdId = oldMembership?.household_id;

  // Leave the old household membership
  await supabase.from('household_members').delete().eq('user_id', user.id);

  // Join the new one
  const { error: joinError } = await supabase.from('household_members').insert({
    household_id: newHousehold.id,
    user_id: user.id,
    full_name: fullName,
  });

  if (joinError) return { error: joinError.message };

  // Bring their own existing data along, so nothing gets orphaned behind
  if (oldHouseholdId && oldHouseholdId !== newHousehold.id) {
    await supabase
      .from('pantry_items')
      .update({ household_id: newHousehold.id })
      .eq('household_id', oldHouseholdId)
      .eq('user_id', user.id);

    await supabase
      .from('shopping_list')
      .update({ household_id: newHousehold.id })
      .eq('household_id', oldHouseholdId)
      .eq('user_id', user.id);

    await supabase
      .from('waste_log')
      .update({ household_id: newHousehold.id })
      .eq('household_id', oldHouseholdId)
      .eq('user_id', user.id);
  }

  return { error: null };
}