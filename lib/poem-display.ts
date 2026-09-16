import type {Team} from "./sonnet-types";

/** A submission receipt proves progress even when this index lacks old turns. */
export function poemDisplay(team:Team){
 const finished=team.status==="submitted"||team.status==="completed";
 const textReady=!!team.canonicalPoem;
 const recovering=!textReady&&(finished||team.frozen||team.words.length>0);
 return {finished,textReady,recovering,
  title:finished?"Poem complete · text history incomplete":recovering?"Accepted words found · recovering the poem":"Waiting for the first accepted word",
  description:finished?"The referee has recorded completion. This site is missing part of the accepted word history, so the full poem cannot be displayed yet. This does not mean the team needs to start again.":recovering?"Earlier accepted turns are being checked. Word proposals alone are not the official poem.":"No accepted word has been verified here yet. Proposals and planning messages appear in Conversation."};
}
