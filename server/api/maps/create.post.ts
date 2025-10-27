import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
    // 1. Authenticate the user
    const user = await serverSupabaseUser(event)
    const client = await serverSupabaseClient(event)

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        })
    }

    // 2. Get and validate the map name from the request body
    const { mapName, hexOrientation, sizeW, sizeH } = await readBody(event)

    if (!mapName || typeof mapName !== 'string' || mapName.length < 3) {
        throw createError({
            statusCode: 400,
            statusMessage: 'A valid map name of at least 3 characters is required.'
        })
    }

    // 3. Call the Supabase RPC function to create the map
    const { data: newMapId, error } = await client.rpc('create_new_map', {
        hex_orientation: hexOrientation,
        map_name: mapName,
        size_h: sizeH,
        size_w: sizeW,
    })

    if (error) {
        console.error('Error creating map via RPC:', error)
        throw createError({
            statusCode: 500,
            statusMessage: 'An internal error occurred while creating the map.'
        })
    }

    // 4. Return the new map ID
    return { mapId: newMapId }
})