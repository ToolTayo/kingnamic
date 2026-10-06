# Empire expansion implementation plan

6 October 2026. Inspection confirms that commander and connected exploration were deferred, not completed. Preserve the existing kingdom, Lost Battalions, v2 saves and fixed-step systems.

1. Add an opt-in commander appointed from an existing fit soldier. Reuse procedural weapon sprites and health/infection/death; provide direct movement, aimed sword/spear/bow attacks, tactical mode and touch controls. No duplicate hero or automatic resurrection.
2. Add one deterministic connected region, Briar March. Keep the existing 30×26 navigation/renderer dimensions per region. Store one inactive region snapshot; transfer actual selected soldiers at a safe, physically reached road exit. Keep one empire treasury and global ID allocation. Inactive encounters and illness are held; existing workers maintain supply production and all residents/soldiers consume provisions. Explain this explicitly.
3. Discover landmarks by proximity, defeat the finite initial threats and establish an outpost anywhere on valid accessible ground. Transfer two actual idle healthy residents from home as builders. Reuse housing, work, recruitment, repairs and destructible defenses. Warn before bounded later incursions; retain damage, casualties and defenders across travel.
4. Validate modern regional saves recursively without allowing nested empires, duplicated people, transferred infections, or duplicate rewards. Legacy saves remain unchanged until the player appoints a commander/travels.
5. Test direct weapons, placement validity/access, travel and independent defenders, death/infection, original expeditions, legacy/offline saves, full browser explore–clear–build–leave–return loops and measured army stress. Report remaining limits and actual performance, including unreproduced hitches.

No streaming dependency, external assets, publication or deployment. One connected region is the complete content target.
